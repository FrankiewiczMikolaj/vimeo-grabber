import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import { setTimeout, clearTimeout } from 'node:timers';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { avcConfig, dashAvcResponse } from '../test/fixtures/dash-avc-response.mjs';

const extension = resolve(process.env.SMOKE_EXTENSION_DIR ?? 'dist');
const artifacts = resolve(process.env.SMOKE_ARTIFACT_DIR ?? 'artifacts/headed');
await mkdir(artifacts, { recursive: true });
for (const name of ['permission-needed', 'denied', 'qualities', 'audio-footer', 'worker-rebuilt', 'revoked', 'removed', 'navigated',
  'hls-first', 'dash-denied', 'dash-preferred', 'dash-revoked', 'dash-nested', 'dash-mpd', 'unavailable-states', 'tab-isolated', 'tab-restored', 'stale-response', 'failure']) {
  await rm(resolve(artifacts, `${name}.png`), { force: true });
}
const diagnostics = { requests: [], unexpected: [], cleanup: false, entry: 'chrome.action.openPopup' };
const profile = await mkdtemp(resolve(artifacts, 'profile-'));
let context;
let failure;
let command;
let sequence = 0;
// Native X11 key events operate Chrome's permission bubble, not a permission mock.
function key(name) {
  execFileSync('python3', ['-c', `import ctypes,sys
x=ctypes.CDLL('libX11.so.6'); t=ctypes.CDLL('libXtst.so.6')
x.XOpenDisplay.restype=ctypes.c_void_p; d=x.XOpenDisplay(None)
x.XStringToKeysym.argtypes=[ctypes.c_char_p]; x.XStringToKeysym.restype=ctypes.c_ulong
x.XKeysymToKeycode.argtypes=[ctypes.c_void_p,ctypes.c_ulong]; x.XKeysymToKeycode.restype=ctypes.c_uint
k=x.XKeysymToKeycode(d,x.XStringToKeysym(sys.argv[1].encode()))
t.XTestFakeKeyEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
x.XFlush.argtypes=[ctypes.c_void_p]
t.XTestFakeKeyEvent(d,k,1,0); t.XTestFakeKeyEvent(d,k,0,0); x.XFlush(d)
`, name]);
}
function childCommand(session, sessionId, method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(`${method} timed out`)), 10000);
    const receive = event => {
      if (event.sessionId !== sessionId) return;
      const message = JSON.parse(event.message);
      if (message.id === id) finish(message.error && new Error(JSON.stringify(message.error)), message.result);
    };
    function finish(error, result) {
      clearTimeout(timer); session.off('Target.receivedMessageFromTarget', receive);
      if (error) reject(error); else resolve(result);
    }
    session.on('Target.receivedMessageFromTarget', receive);
    session.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(finish);
  });
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function waitText(text) {
  await evaluate(`new Promise((resolve,reject) => {
    const deadline = Date.now()+8000;
    const check = () => {
      if (document.body.innerText.includes(${JSON.stringify(text)})) return resolve(true);
      if (Date.now()>deadline) {
        document.querySelector('#streams article:last-child')?.scrollIntoView();
        return reject(new Error('Missing popup text: '+${JSON.stringify(text)}+'\\n'+document.body.innerText));
      }
      setTimeout(check,50);
    };
    check();
  })`);
}
async function activatePermission() {
  await evaluate(`(() => {
    const button = document.querySelector('#streams button');
    button.scrollIntoView();
    button.focus();
    return true;
  })()`);
  // Native input does not await a CDP reply from the popup that Chrome closes.
  key('Return');
}
async function fixtureResponse(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Held metadata response timed out')), 10000);
    })]);
  } finally { clearTimeout(timer); }
}
try {
  const manifest = JSON.parse(await readFile(`${extension}/manifest.json`, 'utf8'));
  assert.ok(!manifest.permissions?.includes('downloads'));
  assert.deepEqual(manifest.host_permissions, ['https://player.vimeo.com/*']);
  assert.deepEqual(manifest.optional_host_permissions, ['https://*.vimeocdn.com/*']);
  context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: false,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const master = await readFile('test/fixtures/hls-master.m3u8', 'utf8');
  const config = { video: { id: 20, title: '<img src=x onerror=alert(1)> Owned video' }, request: { files: { hls: {
    default_cdn: 'unsupported', cdns: { unsupported: { url: 'https://unsupported.example/master.m3u8' },
      owned: { url: 'https://owned.vimeocdn.com/master.m3u8?sig=dummy' } },
  } } } };
  const dash = await readFile('test/fixtures/dash-json.json', 'utf8');
  const mpd = await readFile('test/fixtures/dash-mpd.mpd', 'utf8');
  const fixtureUrls = Object.values(avcConfig.request.files.dash.cdns).flatMap(entry => [entry.url, entry.avc_url]);
  const allowedAvc = new Set([...fixtureUrls, ...fixtureUrls.filter(url => !url.includes('base64_init=')).map(url => `${url}&base64_init=1`)]);
  diagnostics.initMetadata = [];
  const secondDash = { ...config, request: { files: { ...config.request.files, dash: { cdns: {
    videoOnly: { url: 'https://second.vimeocdn.com/video-only.json' },
    audioOnly: { url: 'https://second.vimeocdn.com/audio-only.json' },
    ...avcConfig.request.files.dash.cdns,
    malformed: { url: 'https://second.vimeocdn.com/malformed.json' },
    protected: { url: 'https://second.vimeocdn.com/protected.mpd' },
  } }, hls: { ...config.request.files.hls, cdns: { ...config.request.files.hls.cdns,
    sameOrigin: { url: 'https://second.vimeocdn.com/master.m3u8?sig=dummy' },
  } } } } };
  const metadata = new Map([
    ['dash.json', ['application/json', dash]],
    ['dash.mpd', ['application/dash+xml', mpd]],
    ['protected.mpd', ['application/dash+xml', '<MPD><ContentProtection schemeIdUri="urn:owned"/></MPD>']],
    ['unsupported.json', ['application/json', '{}']],
    ['malformed.json', ['application/json', '{']],
    ['held.json', ['application/json', dash]],
  ].map(([path, body]) => [path.endsWith('.json') ? `${path}?base64_init=1` : path, body]));
  const ownedConfig = (id, names) => ({ video: { id, title: `Owned ${id}` },
    request: { files: { dash: { cdns: Object.fromEntries(names.map((name, index) =>
      [String(index), { url: `https://owned.vimeocdn.com/${name}` }])) } } } });
  const configs = new Map([
    ['31', ownedConfig(31, ['malformed.json', 'dash.json'])],
    ['32', ownedConfig(32, ['dash.mpd'])],
    ['33', ownedConfig(33, ['protected.mpd'])],
    ['34', ownedConfig(34, ['unsupported.json'])],
    ['35', ownedConfig(35, ['malformed.json'])],
    ['36', ownedConfig(36, ['held.json'])],
  ]);
  let held;
  const heldStarted = new Promise(resolve => { held = resolve; });
  let release;
  const heldResponse = new Promise(resolve => { release = resolve; });
  let delivered;
  const heldDelivered = new Promise(resolve => { delivered = resolve; });
  const player = id => `<iframe src="https://player.vimeo.com/video/${id}"></iframe>`;
  const inline = config => `<script type="application/json">${JSON.stringify(config)}</script>`;
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith('chrome-extension://')) return route.continue();
    diagnostics.requests.push(url);
    if (url === 'https://example.com/fixture') return route.fulfill({ contentType: 'text/html', body: '<title>Unrelated top page</title><iframe src="https://player.vimeo.com/video/20"></iframe>' });
    if (url === 'https://example.com/empty') return route.fulfill({ contentType: 'text/html', body: '<title>Empty owned page</title>' });
    if (url === 'https://player.vimeo.com/video/20') return route.fulfill({ contentType: 'text/html', body: `<title>Owned player</title><script type="application/json">${JSON.stringify(config)}</script>` });
    if (url === 'https://owned.vimeocdn.com/master.m3u8?sig=dummy') return route.fulfill({ contentType: 'application/vnd.apple.mpegurl', body: master });
    if (url === 'https://second.vimeocdn.com/master.m3u8?sig=dummy') return route.fulfill({ contentType: 'application/vnd.apple.mpegurl', body: master });
    if (allowedAvc.has(url)) {
      const body = dashAvcResponse(url);
      diagnostics.initMetadata.push({ path: new URL(url).pathname,
        requested: new URL(url).searchParams.get('base64_init') === '1',
        provided: body.video.every(track => typeof track.init_segment === 'string') });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (url === 'https://second.vimeocdn.com/video-only.json?base64_init=1') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ video: JSON.parse(dash).video }) });
    if (url === 'https://second.vimeocdn.com/audio-only.json?base64_init=1') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ audio: JSON.parse(dash).audio }) });
    if (url === 'https://second.vimeocdn.com/malformed.json?base64_init=1') return route.fulfill({ contentType: 'application/json', body: '{' });
    if (url === 'https://second.vimeocdn.com/protected.mpd') return route.fulfill({ contentType: 'application/dash+xml', body: '<MPD><ContentProtection schemeIdUri="urn:owned"/></MPD>' });
    if (/^https:\/\/player\.vimeo\.com\/video\/20\/config(?:\?h=owned)?$/.test(url)) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(secondDash) });
    if (url === 'https://example.com/matrix') return route.fulfill({ contentType: 'text/html',
      body: `<title>Owned matrix</title>${inline(ownedConfig(999, ['dash.json']))}<iframe src="https://example.com/nested"></iframe>${['31?duplicate', '33', '34', '35'].map(player).join('')}` });
    if (url === 'https://example.com/nested') return route.fulfill({ contentType: 'text/html',
      body: `<title>Owned nested frames</title>${player('31')}` });
    const frame = /^https:\/\/player\.vimeo\.com\/video\/(31|32|33|34|35|36)(\?duplicate)?$/.exec(url);
    if (frame) return route.fulfill({ contentType: 'text/html', body: frame[2]
      ? inline({ video: { id: 31 }, request: { files: { progressive: [] } } })
      : frame[1] === '32' ? '<title>Config fallback only</title>' : inline(configs.get(frame[1])) });
    const fallback = /^https:\/\/player\.vimeo\.com\/video\/(31|32|33|34|35|36)\/config(\?duplicate)?$/.exec(url);
    if (fallback) return route.fulfill({ contentType: 'application/json', body: fallback[2]
      ? JSON.stringify({ video: { id: 31 }, request: { files: { progressive: [] } } })
      : process.env.SMOKE_BREAK_DETECTION === '1' && fallback[1] === '32' ? '{' : JSON.stringify(configs.get(fallback[1])) });
    const owned = metadata.get(url.replace('https://owned.vimeocdn.com/', ''));
    if (owned && url.startsWith('https://owned.vimeocdn.com/')) {
      if (new URL(url).pathname === '/held.json') { held(); await heldResponse; }
      await route.fulfill({ contentType: owned[0], body: owned[1] });
      if (new URL(url).pathname === '/held.json') delivered();
      return;
    }
    diagnostics.unexpected.push(url); return route.abort();
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  let bootstrap = await context.newPage();
  await bootstrap.goto(`chrome-extension://${id}/${manifest.action.default_popup}`);
  let active = context.pages()[0];
  await active.goto('https://example.com/fixture');
  let session = await context.newCDPSession(bootstrap);
  async function open() {
    await active.bringToFront();
    const result = await session.send('Runtime.evaluate', { expression: 'chrome.action.openPopup()', awaitPromise: true });
    assert.equal(result.exceptionDetails, undefined);
    const { targetInfos } = await session.send('Target.getTargets');
    const target = targetInfos.find(t => t.url === `chrome-extension://${id}/${manifest.action.default_popup}` && t.targetId !== session.targetId);
    // Bootstrap has the same URL, so select the actual popup view by attaching candidates.
    for (const candidate of targetInfos.filter(t => t.url === target.url)) {
      const { sessionId } = await session.send('Target.attachToTarget', { targetId: candidate.targetId, flatten: false });
      command = (method, params) => childCommand(session, sessionId, method, params);
      if (await evaluate("chrome.extension.getViews({type:'popup'}).includes(window)")) return;
    }
    throw new Error('No real action popup');
  }
  async function capture(name) {
    const image = await command('Page.captureScreenshot', { format: 'png' });
    await writeFile(resolve(artifacts, `${name}.png`), Buffer.from(image.data, 'base64'));
    diagnostics[name] = await evaluate('document.body.innerText');
  }
  await open();
  await waitText('owned.vimeocdn.com');
  assert.equal(await evaluate("document.querySelectorAll('#streams img').length"), 0);
  assert.equal(await evaluate("typeof chrome.downloads"), 'undefined');
  await capture('permission-needed');
  await active.frames().find(frame => frame.url().startsWith('https://player.vimeo.com/'))
    .evaluate(() => {
      globalThis.history.pushState({}, '', '/video/20?h=owned');
      const script = globalThis.document.querySelector('script[type="application/json"]');
      const config = JSON.parse(script.textContent);
      config.video.title = 'Updated owned video';
      script.textContent = JSON.stringify(config);
    });
  await evaluate(`(async () => {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    const deadline = Date.now()+5000;
    let last;
    while (Date.now()<deadline) {
      const state = await chrome.runtime.sendMessage({type:'popup-state',tabId:tab.id});
      last = state;
      if (state.results.some(candidate => candidate.title === 'Updated owned video'
        && candidate.source.frameUrl === 'https://player.vimeo.com/video/20')) return true;
      await new Promise(r=>setTimeout(r,50));
    }
    throw new Error('Same-document navigation did not rebuild authoritative provenance: '+JSON.stringify(last));
  })()`);
  diagnostics.sameDocumentRebuilt = true;
  // A native user gesture invokes chrome.permissions.request; Escape denies it.
  await activatePermission();
  await new Promise(r => setTimeout(r, 700));
  key('Escape');
  await open();
  await waitText('denied');
  await capture('denied');
  await activatePermission();
  await new Promise(r => setTimeout(r, 700));
  key('Tab'); key('Return');
  await open();
  await waitText('1920');
  await waitText('pl');
  await evaluate("document.querySelector('#streams .tracks').closest('article').scrollIntoView(); true");
  await capture('qualities');
  const tracks = await evaluate("[...document.querySelector('#streams article .tracks').querySelectorAll('li')].map(item => [...item.querySelectorAll('dd')].map(field => field.textContent))");
  assert.deepEqual(tracks.map(t => [t[1], t[4], t[5], t[6], t[7], t[8], t[9]]), [
    ['stereo', '1200000 bit/s', '640 px', '360 px', '29.97 fps', 'Unknown', 'Unknown'],
    ['stereo', '4800000 bit/s', '1920 px', '1080 px', '60 fps', 'Unknown', 'Unknown'],
    ['stereo', 'Unknown', 'Unknown', 'Unknown', 'Unknown', 'en', '2'],
    ['stereo', 'Unknown', 'Unknown', 'Unknown', 'Unknown', 'pl', '6/JOC'],
  ]);
  await evaluate('window.scrollTo(0,document.body.scrollHeight); true');
  await capture('audio-footer');
  // HLS has succeeded. A different exact origin must remain requestable.
  await waitText('Allow https://second.vimeocdn.com');
  await evaluate("document.querySelector('#streams button').closest('article').scrollIntoView(); true");
  await capture('hls-first');
  await activatePermission();
  await new Promise(r => setTimeout(r, 700)); key('Escape');
  await open();
  await waitText('Access to https://second.vimeocdn.com was not granted or was denied');
  await waitText('1920');
  await evaluate("document.querySelector('#streams button').closest('article').scrollIntoView(); true");
  await capture('dash-denied');
  await activatePermission();
  await new Promise(r => setTimeout(r, 700)); key('Tab'); key('Return');
  await open();
  await waitText('Preferred: separate DASH video and audio.');
  const candidates = await evaluate(`(async () => {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    return (await chrome.runtime.sendMessage({type:'popup-state',tabId:tab.id})).results;
  })()`);
  assert.equal(await evaluate("chrome.permissions.contains({origins:['https://second.vimeocdn.com/*']})"), true);
  assert.equal(await evaluate("chrome.permissions.contains({origins:['https://unseen.vimeocdn.com/*']})"), false);
  assert.equal(await evaluate("document.querySelector('#streams article').innerText.includes('Preferred: separate DASH')"), true);
  assert.ok(candidates.some(candidate => candidate.manifest?.protocol === 'hls' && candidate.status === 'found'));
  assert.ok(candidates.some(candidate => candidate.manifest?.cdn === 'sameOrigin' && candidate.status === 'found'));
  assert.equal(await evaluate("document.querySelector('#streams article').innerText.includes('CDN separate')"), true);
  assert.deepEqual(candidates.filter(candidate => candidate.manifest?.cdn === 'separate').map(candidate => candidate.tracks.map(track => track.kind)),
    [['video', 'video', 'audio', 'audio'], ['video', 'video', 'audio', 'audio']]);
  const preferred = candidates.find(candidate => candidate.manifest?.cdn === 'separate');
  assert.equal(preferred.manifest.url, avcConfig.request.files.dash.cdns.separate.avc_url);
  assert.ok(diagnostics.requests.includes(`${avcConfig.request.files.dash.cdns.separate.avc_url}&base64_init=1`));
  assert.equal(diagnostics.requests.includes(avcConfig.request.files.dash.cdns.separate.avc_url), false);
  assert.equal(preferred.tracks[0].codec, 'avc1.4d401e');
  assert.ok(diagnostics.initMetadata.some(item => !item.requested && !item.provided));
  assert.ok(diagnostics.initMetadata.some(item => item.requested && item.provided));
  assert.ok(diagnostics.initMetadata.every(item => item.requested === item.provided));
  assert.deepEqual(candidates.filter(candidate => ['malformed', 'protected'].includes(candidate.manifest?.cdn)).map(candidate => candidate.status),
    ['unsupported', 'protected']);
  for (const candidate of candidates) {
    assert.ok(candidate.tracks.every(track => JSON.stringify(track.manifest) === JSON.stringify(candidate.manifest)));
  }
  await evaluate('window.scrollTo(0,0); true');
  await capture('dash-preferred');
  await evaluate("chrome.permissions.remove({origins:['https://second.vimeocdn.com/*']})");
  await waitText('Allow https://second.vimeocdn.com');
  await waitText('1920');
  assert.equal(await evaluate("document.body.innerText.includes('Preferred: separate DASH')"), false);
  assert.equal(await evaluate("chrome.permissions.contains({origins:['https://owned.vimeocdn.com/*']})"), true);
  await evaluate("document.querySelector('#streams button').closest('article').scrollIntoView(); true");
  await capture('dash-revoked');
  diagnostics.independentCandidates = candidates.map(candidate => ({
    videoId: candidate.videoId, protocol: candidate.manifest?.protocol, cdn: candidate.manifest?.cdn,
    status: candidate.status, trackKinds: candidate.tracks.map(track => track.kind),
  }));
  const internals = await context.newPage();
  await internals.goto('chrome://serviceworker-internals/');
  const renderer = Number(await internals.locator('.serviceworker-item').filter({ hasText: `chrome-extension://${id}/` })
    .locator('.serviceworker-pid .value').innerText());
  assert.ok(Number.isSafeInteger(renderer) && renderer > 1);
  // Kill only the renderer of this fresh owned extension profile to exercise cold
  // rebuild. Prove execution-context loss, not Playwright Worker object identity.
  process.kill(renderer, 'SIGKILL');
  await assert.rejects(worker.evaluate(() => 1), /restarted|closed|destroyed|crash/i);
  diagnostics.workerStopped = true;
  await internals.close();
  await bootstrap.close();
  bootstrap = await context.newPage();
  await bootstrap.goto(`chrome-extension://${id}/${manifest.action.default_popup}`);
  session = await context.newCDPSession(bootstrap);
  await open();
  await waitText('1920');
  await capture('worker-rebuilt');
  await waitText('Allow https://second.vimeocdn.com');
  assert.equal(await evaluate("chrome.permissions.contains({origins:['https://owned.vimeocdn.com/*']})"), true);
  assert.equal(await evaluate("document.querySelectorAll('#streams img').length"), 0);
  assert.ok(diagnostics.requests.includes('https://owned.vimeocdn.com/master.m3u8?sig=dummy'));
  // One matrix combines independent IDs, nested frames, unavailable duplicates,
  // malformed-first fallback, config-only discovery and an unrelated inline decoy.
  await active.goto('https://example.com/matrix');
  await open();
  await waitText('4 videos detected.');
  await active.frames().find(frame => frame.url() === 'https://example.com/nested').evaluate(() => {
    const frame = globalThis.document.createElement('iframe');
    frame.src = 'https://player.vimeo.com/video/32';
    globalThis.document.body.append(frame);
  });
  await waitText('5 videos detected.');
  await waitText('5000000 bit/s');
  await waitText('Protected content.');
  await waitText('This metadata format is not supported.');
  const cards = await evaluate(`[...document.querySelectorAll('#streams article')].map(card => ({
    source: card.querySelector('p').textContent, status: card.querySelectorAll('p')[1].textContent,
    tracks: [...card.querySelectorAll('.tracks li')].map(item =>
      [item.querySelector('h3').textContent, ...[...item.querySelectorAll('dd')].map(field => field.textContent)])
  }))`);
  const byId = id => cards.find(card => card.source.endsWith('Video ' + id) && (id !== 31 || card.tracks.length));
  assert.deepEqual([...new Set(cards.map(card => card.source))].sort(), [31, 32, 33, 34, 35].map(id => `Source: player.vimeo.com · Video ${id}`));
  assert.ok(cards.some(card => card.source.endsWith('Video 31') && card.status === 'This metadata format is not supported.'));
  assert.deepEqual(byId(31).tracks, [
    ['Video · DASH', 'video-360', 'Unknown', 'avc1.4d401e', 'video/mp4', '650000 bit/s', '640 px', '360 px', '29.97 fps', 'Unknown', 'Unknown'],
    ['Video · DASH', 'video-1080', 'Unknown', 'avc1.640028', 'video/mp4', '4200000 bit/s', '1920 px', '1080 px', '60 fps', 'Unknown', 'Unknown'],
    ['Audio · DASH', 'audio-en', 'Unknown', 'mp4a.40.2', 'audio/mp4', '128000 bit/s', 'Unknown', 'Unknown', 'Unknown', 'en', '2'],
    ['Audio · DASH', 'audio-pl', 'Unknown', 'mp4a.40.2', 'audio/mp4', '192000 bit/s', 'Unknown', 'Unknown', 'Unknown', 'pl', '5.1'],
  ]);
  assert.deepEqual(byId(32).tracks, [
    ['Video · DASH', 'high', 'picture', 'avc1.640028', 'video/mp4', '5000000 bit/s', '1920 px', '1080 px', '29.97002997002997 fps', 'Unknown', 'Unknown'],
    ['Video · DASH', 'low', 'picture', 'avc1.42001e', 'video/mp4', '900000 bit/s', '640 px', '360 px', '24 fps', 'Unknown', 'Unknown'],
    ['Audio · DASH', 'english', 'sound', 'mp4a.40.2', 'audio/mp4', '128000 bit/s', 'Unknown', 'Unknown', 'Unknown', 'en', '2'],
    ['Audio · DASH', 'polish', 'sound', 'mp4a.40.2', 'audio/mp4', 'Unknown', 'Unknown', 'Unknown', 'Unknown', 'pl', '6'],
  ]);
  assert.equal(byId(33).status, 'Protected content. No usable tracks are offered.');
  assert.equal(byId(34).status, 'This metadata format is not supported.');
  assert.equal(byId(35).status, 'This metadata format is not supported.');
  for (const id of [33, 34, 35]) assert.deepEqual(byId(id).tracks, []);
  diagnostics.matrix = cards;
  await capture('dash-nested');
  await evaluate("[...document.querySelectorAll('#streams article')].find(card => card.querySelector('p').textContent.endsWith('Video 32')).scrollIntoView(); true");
  await capture('dash-mpd');
  await evaluate("[...document.querySelectorAll('#streams article')].find(card => card.querySelector('p').textContent.endsWith('Video 33')).scrollIntoView(); true");
  await capture('unavailable-states');
  const matrixTab = active;
  active = await context.newPage();
  await active.goto('https://example.com/empty');
  await open();
  await waitText('No Vimeo');
  assert.equal(await evaluate("document.querySelectorAll('#streams article').length"), 0);
  await capture('tab-isolated');
  active = matrixTab;
  await open();
  await waitText('5000000 bit/s');
  assert.equal(await evaluate("new Set([...document.querySelectorAll('#streams article')].map(card => card.querySelector('p').textContent)).size"), 5);
  await capture('tab-restored');
  // Hold a real transport response across document replacement. Release it only
  // after the new document has published its own successful result.
  await active.goto('https://player.vimeo.com/video/36');
  await fixtureResponse(heldStarted);
  await active.goto('https://player.vimeo.com/video/32');
  await open();
  await waitText('5000000 bit/s');
  release();
  await fixtureResponse(heldDelivered);
  await evaluate(`new Promise((resolve,reject) => {
    const until = Date.now()+1500;
    const check = () => {
      const text = document.body.innerText;
      if (text.includes('Video 36') || !text.includes('Video 32')) return reject(new Error(text));
      if (Date.now()>=until) return resolve(true);
      setTimeout(check,50);
    }; check();
  })`);
  await capture('stale-response');
  diagnostics.heldResponseReleasedAfterNavigation = true;
  await active.goto('https://example.com/fixture');
  await open();
  await waitText('1920');
  // Real revocation API must invalidate qualities, not keep stale successful tracks.
  await evaluate("chrome.permissions.remove({origins:['https://owned.vimeocdn.com/*']})");
  await waitText('Metadata access is needed');
  assert.equal(await evaluate("document.querySelectorAll('.tracks li').length"), 0);
  await capture('revoked');
  await active.locator('iframe').evaluate(frame => frame.remove());
  await waitText('No Vimeo');
  await capture('removed');
  await active.evaluate(() => {
    const frame = globalThis.document.createElement('iframe');
    frame.src = 'https://player.vimeo.com/video/20';
    globalThis.document.body.append(frame);
  });
  await waitText('owned.vimeocdn.com');
  await active.locator('iframe').evaluate(frame => { frame.src = 'https://example.com/empty'; });
  await waitText('No Vimeo');
  await capture('navigated');
  assert.deepEqual(diagnostics.unexpected, []);
  await session.detach();
} catch (error) {
  failure = error; diagnostics.error = error.stack;
  if (command) {
    try {
      diagnostics.failureText = await evaluate('document.body.innerText');
      const image = await command('Page.captureScreenshot', { format: 'png' });
      await writeFile(resolve(artifacts, 'failure.png'), Buffer.from(image.data, 'base64'));
    } catch { /* Preserve original failure. */ }
  }
} finally {
  if (context) {
    await context.tracing.stop({ path: resolve(artifacts, 'trace.zip') }).catch(() => {});
    await context.close();
  }
  await rm(profile, { recursive: true, force: true });
  diagnostics.cleanup = true;
  diagnostics.requests = diagnostics.requests.map(value => value.split('?')[0]);
  await writeFile(resolve(artifacts, 'diagnostics.json'), JSON.stringify(diagnostics, null, 2));
}
if (failure) { console.error(failure); process.exitCode = 1; }
else console.log(`PASS: real action popup, HLS/DASH JSON/MPD, nested IDs, tab isolation, stale response, exact-origin grant/deny/revoke, worker rebuild, removal; ${artifacts}`);

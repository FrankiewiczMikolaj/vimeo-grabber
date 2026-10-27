import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import { setTimeout, clearTimeout } from 'node:timers';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const extension = resolve(process.env.SMOKE_EXTENSION_DIR ?? 'dist');
const artifacts = resolve(process.env.SMOKE_ARTIFACT_DIR ?? 'artifacts/headed');
await mkdir(artifacts, { recursive: true });
for (const name of ['permission-needed', 'denied', 'qualities', 'audio-footer', 'worker-rebuilt', 'revoked', 'removed', 'navigated', 'failure']) {
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
    const deadline = Date.now()+10000;
    const check = () => document.body.innerText.includes(${JSON.stringify(text)}) ? resolve(true)
      : Date.now()>deadline ? reject(new Error(document.body.innerText)) : setTimeout(check,50);
    check();
  })`);
}
async function clickPermission() {
  const point = await evaluate(`(() => {
    const button = document.querySelector('#streams button');
    button.scrollIntoView();
    const r = button.getBoundingClientRect();
    return {x:r.x+r.width/2, y:r.y+r.height/2};
  })()`);
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
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
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('chrome-extension://')) return route.continue();
    diagnostics.requests.push(url);
    if (url === 'https://example.com/fixture') return route.fulfill({ contentType: 'text/html', body: '<title>Unrelated top page</title><iframe src="https://player.vimeo.com/video/20"></iframe>' });
    if (url === 'https://example.com/empty') return route.fulfill({ contentType: 'text/html', body: '<title>Empty owned page</title>' });
    if (url === 'https://player.vimeo.com/video/20') return route.fulfill({ contentType: 'text/html', body: `<title>Owned player</title><script type="application/json">${JSON.stringify(config)}</script>` });
    if (url === 'https://owned.vimeocdn.com/master.m3u8?sig=dummy') return route.fulfill({ contentType: 'application/vnd.apple.mpegurl', body: master });
    if (/^https:\/\/player\.vimeo\.com\/video\/20\/config(?:\?h=owned)?$/.test(url)) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(config) });
    diagnostics.unexpected.push(url); return route.abort();
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  let bootstrap = await context.newPage();
  await bootstrap.goto(`chrome-extension://${id}/${manifest.action.default_popup}`);
  const active = context.pages()[0];
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
      if (state.results[0]?.video.title === 'Updated owned video'
        && state.results[0].video.source.frameUrl === 'https://player.vimeo.com/video/20') return true;
      await new Promise(r=>setTimeout(r,50));
    }
    throw new Error('Same-document navigation did not rebuild authoritative provenance: '+JSON.stringify(last));
  })()`);
  diagnostics.sameDocumentRebuilt = true;
  // A real user-gesture click invokes chrome.permissions.request; Escape denies it.
  await clickPermission();
  await new Promise(r => setTimeout(r, 700));
  key('Escape');
  await open();
  await waitText('denied');
  await capture('denied');
  await clickPermission();
  await new Promise(r => setTimeout(r, 700));
  key('Tab'); key('Return');
  await open();
  await waitText('1920');
  await waitText('pl');
  await capture('qualities');
  const tracks = await evaluate("[...document.querySelectorAll('.tracks li')].map(item => [...item.querySelectorAll('dd')].map(field => field.textContent))");
  assert.deepEqual(tracks.map(t => [t[1], t[4], t[5], t[6], t[7], t[8], t[9]]), [
    ['stereo', '1200000 bit/s', '640 px', '360 px', '29.97 fps', 'Unknown', 'Unknown'],
    ['stereo', '4800000 bit/s', '1920 px', '1080 px', '60 fps', 'Unknown', 'Unknown'],
    ['stereo', 'Unknown', 'Unknown', 'Unknown', 'Unknown', 'en', '2'],
    ['stereo', 'Unknown', 'Unknown', 'Unknown', 'Unknown', 'pl', '6/JOC'],
  ]);
  await evaluate('window.scrollTo(0,document.body.scrollHeight); true');
  await capture('audio-footer');
  const internals = await context.newPage();
  await internals.goto('chrome://serviceworker-internals/');
  const renderer = Number(await internals.locator('.serviceworker-item').filter({ hasText: `chrome-extension://${id}/` })
    .locator('.serviceworker-pid .value').innerText());
  assert.ok(Number.isSafeInteger(renderer) && renderer > 1);
  // Kill only the renderer of this fresh owned extension profile. Debugger-attached
  // workers ignore the normal Stop control; a renderer crash exercises cold rebuild.
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
  assert.equal(await evaluate("document.querySelectorAll('#streams button').length"), 0);
  assert.equal(await evaluate("chrome.permissions.contains({origins:['https://owned.vimeocdn.com/*']})"), true);
  assert.equal(await evaluate("document.querySelectorAll('#streams img').length"), 0);
  assert.ok(diagnostics.requests.includes('https://owned.vimeocdn.com/master.m3u8?sig=dummy'));
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
  await writeFile(resolve(artifacts, 'diagnostics.json'), JSON.stringify(diagnostics, null, 2));
}
if (failure) { console.error(failure); process.exitCode = 1; }
else console.log(`PASS: real action popup, child-frame qualities, exact-origin grant/deny/revoke, removal, metadata-only fallback; ${artifacts}`);

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import { URL } from 'node:url';
import { chromium } from 'playwright';

const artifacts = resolve(process.env.SMOKE_ARTIFACT_DIR ?? 'artifacts/retention', 'retention');
await mkdir(artifacts, { recursive: true });
const profile = await mkdtemp(resolve(artifacts, 'profile-'));
const extension = resolve('dist');
const observations = {};
let context;
let sequence = 0;
try {
  context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: false,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--enable-unsafe-extension-debugging', '--gtk-version=3'] });
  const dash = await readFile('test/fixtures/dash-json.json', 'utf8');
  const hls = await readFile('test/fixtures/hls-master.m3u8', 'utf8');
  const complete = { video: { id: 20, title: 'Before partial capture' }, request: { files: {
    dash: { cdns: { owned: { url: 'https://owned.vimeocdn.com/dash.json' } } },
    hls: { cdns: { owned: { url: 'https://owned.vimeocdn.com/master.m3u8' } } },
    progressive: [{ url: 'https://owned.vimeocdn.com/video.mp4', mime: 'video/mp4', height: 720 }],
  } } };
  let config = complete;
  let configStatus = 200;
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('chrome-extension://')) return route.continue();
    if (url === 'https://player.vimeo.com/video/20') return route.fulfill({ contentType: 'text/html',
      body: `<script type="application/json">${JSON.stringify(config)}</script>` });
    if (url === 'https://player.vimeo.com/video/20/config') return route.fulfill({
      status: configStatus, contentType: 'application/json', body: JSON.stringify(config) });
    if (url === 'https://owned.vimeocdn.com/dash.json?base64_init=1') return route.fulfill({ contentType: 'application/json', body: dash });
    if (url === 'https://owned.vimeocdn.com/master.m3u8') return route.fulfill({ contentType: 'application/vnd.apple.mpegurl', body: hls });
    throw new Error(`Unexpected fixture request: ${url}`);
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const bootstrap = await context.newPage();
  await bootstrap.goto(`chrome-extension://${id}/manifest.json`);
  const page = context.pages()[0];
  await page.goto('https://player.vimeo.com/video/20');
  await page.bringToFront();
  const session = await context.newCDPSession(bootstrap);
  await session.send('Runtime.evaluate', { expression: 'chrome.action.openPopup()', awaitPromise: true });
  const { targetInfos } = await session.send('Target.getTargets');
  const target = targetInfos.find(t => t.url === `chrome-extension://${id}/popup.html`);
  assert.ok(target, 'real action popup');
  const { sessionId } = await session.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
  function command(method, params = {}) {
    const commandId = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error(`${method} timed out`)), 15000);
      function finish(error, result) {
        clearTimeout(timer); session.off('Target.receivedMessageFromTarget', receive);
        if (error) reject(error); else resolve(result);
      }
      function receive(event) {
        if (event.sessionId !== sessionId) return;
        const message = JSON.parse(event.message);
        if (message.id === commandId) finish(message.error && new Error(JSON.stringify(message.error)), message.result);
      }
      session.on('Target.receivedMessageFromTarget', receive);
      void session.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id: commandId, method, params }) }).catch(finish);
    });
  }
  async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  await evaluate("document.querySelector('#acknowledge').click(); true");
  async function capture(name, title) {
    const state = await evaluate(`(async () => {
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      const deadline = Date.now()+10000;
      while (Date.now()<deadline) {
        const state = await chrome.runtime.sendMessage({type:'popup-state',tabId:tab.id});
        if (state.results.some(c=>c.title===${JSON.stringify(title)}) && !state.frames.some(f=>f.status==='pending') &&
          document.querySelector('#streams h2')?.textContent === ${JSON.stringify(title)}) {
          return {state, text:document.body.innerText, cards:document.querySelectorAll('#streams article').length,
            badge:await chrome.action.getBadgeText({tabId:tab.id})};
        }
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      throw new Error('Missing resolved title');
    })()`);
    observations[name] = state;
    const image = await command('Page.captureScreenshot', { format: 'png' });
    await writeFile(resolve(artifacts, `${name}.png`), Buffer.from(image.data, 'base64'));
    await writeFile(resolve(artifacts, 'observations.json'), JSON.stringify(observations, null, 2));
    return state;
  }
  const before = await capture('before', complete.video.title);
  const protocols = state => [...new Set(state.state.results.filter(c => c.status === 'found').map(c => c.manifest?.protocol))].sort();
  assert.deepEqual(protocols(before), ['dash', 'hls', 'progressive']);
  config = { video: { id: 20, title: 'After partial capture' } };
  await page.evaluate(value => { globalThis.document.querySelector('script').textContent = JSON.stringify(value); }, config);
  const after = await capture('partial', config.video.title);
  assert.deepEqual(protocols(after), ['dash', 'hls', 'progressive'], 'partial inline AND fetched configs must retain all whole alternatives');
  assert.equal(after.cards, 1);
  assert.equal(after.badge, '1');
  assert.ok(after.state.results.every(c => c.title === config.video.title));
  configStatus = 403;
  config = { video: { id: 20, title: 'Source access refused' } };
  await page.evaluate(value => { globalThis.document.querySelector('script').textContent = JSON.stringify(value); }, config);
  const refused = await capture('source-refused', config.video.title);
  assert.deepEqual(protocols(refused), ['dash', 'hls', 'progressive'], 'independent inline source survives config refusal');
  assert.ok(!refused.state.results.some(c => c.source.configUrl && c.status === 'found'));
  assert.ok(refused.state.results.some(c => c.invalidation === 'source'));
  configStatus = 200;
  config = { ...complete, video: { id: 20, title: 'Only HLS protected' },
    request: { files: { ...complete.request.files, hls: { ...complete.request.files.hls, encrypted: true } } } };
  await page.evaluate(value => { globalThis.document.querySelector('script').textContent = JSON.stringify(value); }, config);
  const scoped = await capture('candidate-protected', config.video.title);
  assert.deepEqual(protocols(scoped), ['dash', 'progressive'], 'candidate protection must preserve independent clear alternatives');
  assert.ok(scoped.state.results.filter(c => c.manifest?.protocol === 'hls').every(c => c.status === 'protected'));
  config = { video: { id: 20, title: 'Video protection without manifests', drm: true } };
  await page.evaluate(value => { globalThis.document.querySelector('script').textContent = JSON.stringify(value); }, config);
  const protectedVideo = await capture('video-protected', config.video.title);
  assert.deepEqual(protocols(protectedVideo), [], 'video protection must remove old clear actions with omitted manifests');
  config = { video: { id: 20, title: 'Partial after protection' } };
  await page.evaluate(value => { globalThis.document.querySelector('script').textContent = JSON.stringify(value); }, config);
  assert.deepEqual(protocols(await capture('still-protected', config.video.title)), [], 'partial capture cannot resurrect clear actions');
  console.log('Chromium retention: partial inline and fetched alternatives retain DASH/HLS/progressive with fresh title, one card and badge.');
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}

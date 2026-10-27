import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import { build } from 'vite';

test('compiled broker validates real Chrome senders and rejects stale document completions', async () => {
  const dir = await mkdtemp(resolve('.frame-state-'));
  const bundle = await build({ configFile: false, logLevel: 'silent', build: {
    lib: { entry: 'src/detect/frame-state.ts', formats: ['es'] }, write: false,
  } });
  const output = Array.isArray(bundle) ? bundle[0].output : bundle.output;
  await writeFile(`${dir}/core.js`, output[0].code);
  await writeFile(`${dir}/manifest.json`, JSON.stringify({ manifest_version: 3, name: 'Frame state proof', version: '1',
    background: { service_worker: 'worker.js', type: 'module' },
    content_scripts: [{ matches: ['https://player.vimeo.com/*'], js: ['content.js'], all_frames: true }],
  }));
  await writeFile(`${dir}/worker.js`, `import { createFrameState, validateFrameDiscovery } from './core.js';
    globalThis.core = { createFrameState, validateFrameDiscovery };
    globalThis.broker = createFrameState(chrome.runtime.id, async () => []);
    chrome.runtime.onMessage.addListener((message, sender, reply) => {
      broker.activate(sender.tab.id, sender.frameId, sender.documentId);
      broker.publish(message, sender).then(accepted => { globalThis.proof = { accepted, sender, frames: broker.frames(sender.tab.id) }; reply(accepted); });
      return true;
    });`);
  await writeFile(`${dir}/content.js`, `chrome.runtime.sendMessage({type: 'frame-discovery', discovery: { videos: [], configUrls: [] }});`);
  let context;
  try {
    context = await chromium.launchPersistentContext(`${dir}/profile`, { channel: 'chromium',
      args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`] });
    await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<title>Offline state proof</title>' }));
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const page = await context.newPage();
    await page.goto('https://player.vimeo.com/video/20');
    await page.waitForFunction(() => globalThis.document.title === 'Offline state proof');
    const actual = await worker.evaluate(async () => {
      while (!globalThis.proof) await new Promise(r => globalThis.setTimeout(r, 10));
      return globalThis.proof;
    });
    assert.equal(actual.accepted, true);
    assert.equal(actual.sender.documentLifecycle, 'active');
    assert.equal(actual.frames[0].documentId, actual.sender.documentId);
    const result = await worker.evaluate(async actualSender => {
      const { createFrameState, validateFrameDiscovery } = globalThis.core;
      const check = (condition, name) => { if (!condition) throw new Error(name); };
      const sender = { ...actualSender, tab: { id: 1 }, frameId: 0, documentId: 'a' };
      const message = { type: 'frame-discovery', discovery: { videos: [], configUrls: [] } };
      const jobs = [];
      const state = createFrameState(globalThis.chrome.runtime.id, () => new Promise((resolve, reject) => jobs.push({ resolve, reject })));
      state.activate(1, 0, 'a');
      for (const patch of [{ id: 'foreign' }, { tab: undefined }, { frameId: -1 }, { documentId: '' },
        { documentLifecycle: 'cached' }, { origin: 'https://evil.test' }, { url: 'https://evil.test/' }]) {
        check(!await state.publish(message, { ...sender, ...patch }), 'reject forged sender');
      }
      for (const bad of [{ ...message, tabId: 9 }, { type: 'fetch', url: sender.url },
        { ...message, discovery: { videos: [], configUrls: Array(65).fill('x') } },
        { ...message, discovery: { videos: [], configUrls: ['https://evil.test/config'] } },
        { ...message, discovery: { videos: [{ id: '20' }], configUrls: [] } },
        { ...message, discovery: { videos: [], configUrls: ['x'.repeat(262145)] } }]) {
        check(!await state.publish(bad, sender), 'reject bad envelope');
      }
      check(jobs.length === 0, 'invalid input never resolves');
      const video = (id, frameUrl) => ({ id, title: id, source: { frameUrl, configUrl: null }, status: 'found', manifests: [], tracks: [] });
      const resolved = (id, frameUrl) => [{ video: video(id, frameUrl), permissionOrigins: ['https://owned.vimeocdn.com'] }];
      const inline = video('20', sender.url);
      inline.manifests = [{ protocol: 'hls', cdn: 'owned', url: 'https://owned.vimeocdn.com/master.m3u8?sig=dummy' }];
      inline.tracks = [{ id: 'audio', groupId: null, kind: 'audio', manifest: inline.manifests[0],
        codec: null, mimeType: null, bandwidth: null, width: null, height: null, frameRate: null, language: 'en', channels: null }];
      const valid = { ...message, discovery: { videos: [inline], configUrls: ['https://player.vimeo.com/video/20/config?h=dummy%2f'] } };
      check(validateFrameDiscovery(valid, sender, globalThis.chrome.runtime.id)?.configUrls[0].endsWith('dummy%2f'), 'typed snapshot and signed query admitted');
      inline.status = ['found'];
      check(!validateFrameDiscovery(valid, sender, globalThis.chrome.runtime.id), 'status must be a string');
      inline.status = 'found'; inline.tracks[0].manifest.url = 'https://evil.test/master.m3u8';
      check(!validateFrameDiscovery(valid, sender, globalThis.chrome.runtime.id), 'no arbitrary metadata host');
      check(!validateFrameDiscovery({ ...message, discovery: { videos: [video('20', 'https://evil.test')], configUrls: [] } }, sender, globalThis.chrome.runtime.id), 'reject forged video provenance');
      const old = state.publish(message, sender);
      check(state.frames(1)[0].status === 'pending', 'pending transition');
      const fresh = state.publish(message, sender);
      jobs[1].resolve(resolved('20', sender.url)); await fresh;
      jobs[0].resolve(resolved('99', sender.url)); await old;
      check(state.videos(1)[0].video.id === '20', 'replacement beats held completion');
      const second = { ...sender, frameId: 2, documentId: 'b', url: 'https://player.vimeo.com/video/21' };
      state.activate(1, 2, 'b');
      const duplicate = state.publish(message, second);
      jobs[2].resolve([...resolved('20', second.url), ...resolved('21', second.url)]); await duplicate;
      check(state.videos(1).length === 2 && state.videos(1)[0].video.source.frameUrl === sender.url, 'whole-result deduplication');
      state.remove(1, 0, 'a');
      check(state.videos(1)[0].video.source.frameUrl === second.url, 'surviving frame provenance');
      check(state.videos(1)[0].permissionOrigins[0] === 'https://owned.vimeocdn.com', 'exact permission retained');
      const other = { ...sender, tab: { id: 2 } }; state.activate(2, 0, 'a');
      const isolated = state.publish(message, other); jobs[3].resolve(resolved('77', sender.url)); await isolated;
      for (const action of ['activate', 'remove', 'clearTab', 'clear']) {
        state.activate(1, 2, 'b'); const held = state.publish(message, second);
        const job = jobs.at(-1);
        if (action === 'activate') state.activate(1, 2, 'new');
        if (action === 'remove') state.remove(1, 2, 'b');
        if (action === 'clearTab') state.clearTab(1);
        if (action === 'clear') state.clear();
        job.resolve(resolved('88', second.url)); await held;
        check(state.videos(1).length === 0, action + ' blocks resurrection');
        if (action !== 'clear') check(state.videos(2)[0].video.id === '77', 'tab isolation');
      }
      check(!await state.publish(message, second), 'no implicit reactivation');
      state.activate(1, 2, 'b'); const failed = state.publish(message, second);
      jobs.at(-1).reject(new Error('https://signed.invalid/?secret')); await failed;
      check(state.frames(1)[0].status === 'error' && !JSON.stringify(state.frames(1)).includes('secret'), 'redacted error transition');
      const rebuilt = state.publish(message, second); jobs.at(-1).resolve(resolved('21', second.url)); await rebuilt;
      state.remove(1, 2, 'old');
      check(state.videos(1)[0].video.id === '21', 'fresh rebuild and old disconnect ignored');
      const copy = state.videos(1); copy[0].video.id = 'mutated';
      check(state.videos(1)[0].video.id === '21', 'snapshot isolation');
      const successfulSender = { ...second, url: 'https://player.vimeo.com/video/20?embedded=1' };
      const unavailable = { video: video('20', sender.url), permissionOrigins: [] };
      unavailable.video.status = 'unavailable';
      const available = resolved('20', successfulSender.url)[0];
      const reference = { protocol: 'dash', cdn: 'owned', url: 'https://owned.vimeocdn.com/master.json' };
      available.video.manifests = [reference];
      available.video.tracks = [{ id: '720p', groupId: null, kind: 'video', manifest: reference,
        codec: null, mimeType: null, bandwidth: null, width: 1280, height: 720,
        frameRate: null, language: null, channels: null }];
      const preference = createFrameState(globalThis.chrome.runtime.id,
        async (_discovery, frameUrl) => [frameUrl === sender.url ? unavailable : available]);
      for (const current of [sender, successfulSender]) {
        preference.activate(1, current.frameId, current.documentId);
        await preference.publish(message, current);
      }
      const chosen = preference.videos(1)[0];
      check(chosen.video.tracks[0]?.id === '720p' &&
        chosen.video.source.frameUrl === successfulSender.url &&
        chosen.permissionOrigins[0] === 'https://owned.vimeocdn.com', 'usable qualities beat unavailable lower frame');
      preference.remove(1, successfulSender.frameId, successfulSender.documentId);
      check(preference.videos(1)[0].video.status === 'unavailable' &&
        preference.videos(1)[0].permissionOrigins.length === 0, 'removed success restores whole unavailable result');
      return 'sender boundary, replacement, deduplication, isolation, invalidation, errors, rebuild passed';
    }, actual.sender);
    assert.match(result, /rebuild passed/);
    console.log(result);
  } finally {
    await context?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

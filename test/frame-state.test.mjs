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
      const resolved = (id, frameUrl) => [{ id, videoId: id, title: id, source: { frameUrl, configUrl: null },
        manifest: null, status: 'unavailable', tracks: [] }];
      const inline = video('20', sender.url);
      inline.manifests = [{ protocol: 'hls', cdn: 'owned', url: 'https://owned.vimeocdn.com/master.m3u8?sig=dummy' }];
      inline.tracks = [{ id: 'audio', groupId: null, kind: 'audio', manifest: inline.manifests[0],
        download: { kind: 'playlist', url: 'https://owned.vimeocdn.com/audio.m3u8' },
        codec: null, mimeType: null, bandwidth: null, width: null, height: null, frameRate: null, language: 'en', channels: null }];
      const valid = { ...message, discovery: { videos: [inline], configUrls: ['https://player.vimeo.com/video/20/config?h=abc123&sig=dummy%2f'] } };
      check(validateFrameDiscovery(valid, sender, globalThis.chrome.runtime.id)?.configUrls[0].endsWith('dummy%2f'), 'typed snapshot and signed query admitted');
      const parent = { ...sender, origin: 'https://example.com', url: 'https://example.com/owned' };
      check(validateFrameDiscovery({ ...valid, discovery: { ...valid.discovery, videos: [] } },
        parent, globalThis.chrome.runtime.id), 'parent admits bounded config references');
      check(!validateFrameDiscovery({ ...valid, discovery: { ...valid.discovery,
        videos: [video('20', parent.url)] } }, parent, globalThis.chrome.runtime.id),
        'parent cannot publish inline data');
      for (const suffix of ['?h=bad%2fhash', '?h=a&h=b', '?h=', '?h=' + 'a'.repeat(129)]) {
        check(!validateFrameDiscovery({ ...message, discovery: { videos: [],
          configUrls: ['https://player.vimeo.com/video/20/config' + suffix] } },
        parent, globalThis.chrome.runtime.id), 'malformed hash cannot reach resolver');
      }
      inline.status = ['found'];
      check(!validateFrameDiscovery(valid, sender, globalThis.chrome.runtime.id), 'status must be a string');
      inline.status = 'found'; inline.tracks[0].manifest.url = 'https://evil.test/master.m3u8';
      check(!validateFrameDiscovery(valid, sender, globalThis.chrome.runtime.id), 'no arbitrary metadata host');
      check(!validateFrameDiscovery({ ...message, discovery: { videos: [video('20', 'https://evil.test')], configUrls: [] } }, sender, globalThis.chrome.runtime.id), 'reject forged video provenance');
      inline.manifests[0].url = 'https://owned.vimeocdn.com/master.m3u8?sig=dummy';
      // Exercise retention separately from the stale-completion scheduling matrix below.
      let next = [];
      const retained = createFrameState(globalThis.chrome.runtime.id, async () => next);
      retained.activate(1, 0, 'a');
      const reference = { ...message, discovery: { videos: [video('20', sender.url)], configUrls: [] } };
      const whole = { ...resolved('20', sender.url)[0], status: 'found', manifest: inline.manifests[0],
        tracks: [globalThis.structuredClone(inline.tracks[0])] };
      const alternative = { ...whole, id: 'other', manifest: { ...whole.manifest, cdn: 'independent',
        url: 'https://independent.vimeocdn.com/master.m3u8' }, tracks: [{ ...whole.tracks[0], id: 'independent-audio' }] };
      next = [whole, alternative]; await retained.publish(reference, sender);
      next = [{ ...resolved('20', sender.url)[0], title: 'New title' }]; await retained.publish(reference, sender);
      check(retained.candidates(1).filter(c => c.status === 'found').length === 2 &&
        retained.candidates(1).every(c => c.title === 'New title'), 'partial preserves independent sources and updates title');
      check(JSON.stringify(retained.candidates(1)[0].tracks) === JSON.stringify(whole.tracks), 'whole track lineage retained');
      next = [{ ...whole, status: 'protected', tracks: [] }]; await retained.publish(reference, sender);
      check(retained.candidates(1).filter(c => c.status === 'found').every(c => c.manifest.cdn === 'independent'),
        'candidate protection removes only its former clear action');
      next = [{ ...resolved('20', sender.url)[0], status: 'protected', invalidation: 'video' }];
      await retained.publish(reference, sender);
      check(!retained.candidates(1).some(c => c.status === 'found'), 'manifest-free video protection removes all old clear actions');
      next = [whole]; await retained.publish(reference, sender);
      next = [{ ...whole, status: 'unavailable', tracks: [], invalidation: 'source' }]; await retained.publish(reference, sender);
      check(!retained.candidates(1).some(c => c.status === 'found'), 'authoritative source refusal is not partial');
      next = [whole]; await retained.publish(reference, sender);
      next = [];
      const removed = retained.publish(message, sender);
      check(retained.candidates(1).length === 0, 'empty authoritative references prune synchronously');
      await removed;
      retained.activate(1, 0, 'a');
      check(retained.candidates(1).length === 0, 'same-ID activation starts a fresh lifetime');
      next = Array.from({ length: 300 }, (_, index) => ({ ...whole, id: String(index),
        manifest: { ...whole.manifest, url: `https://owned.vimeocdn.com/${index}.m3u8` } }));
      await retained.publish(reference, sender);
      check(retained.candidates(1).length === 256, 'whole candidates have a hard frame bound');
      next = [whole]; await retained.publish(reference, sender);
      for (let index = 0; index < 10; index++) {
        next = [{ ...whole, id: `signed-${index}`, manifest: { ...whole.manifest,
          url: `https://owned.vimeocdn.com/master.m3u8?sig=${index}` } }];
        await retained.publish(reference, sender);
      }
      check(retained.candidates(1).filter(c => c.manifest?.url.includes('/master.m3u8')).length === 1,
        'new links replace signed history without splicing tracks');
      retained.activate(1, 0, 'a');
      const configUrl = 'https://player.vimeo.com/video/20/config';
      const bothSources = { ...reference, discovery: { ...reference.discovery, configUrls: [configUrl] } };
      const fetched = { ...whole, id: 'fetched', source: { ...whole.source, configUrl } };
      next = [whole, fetched]; await retained.publish(bothSources, sender);
      next = [{ ...resolved('20', sender.url)[0], title: 'New inline title' },
        { ...resolved('20', sender.url)[0], id: 'partial-fetched', source: fetched.source, title: 'Fetched title' }];
      await retained.publish(bothSources, sender);
      check(retained.candidates(1).filter(c => c.status === 'found').every(c =>
        c.title === (c.source.configUrl ? 'Fetched title' : 'New inline title')),
      'fallback metadata cannot overwrite the independent inline title');
      const inlineProtected = { ...bothSources, discovery: { ...bothSources.discovery,
        videos: [{ ...video('20', sender.url), manifests: [{ ...whole.manifest, protected: true }] }] } };
      next = [];
      const protecting = retained.publish(inlineProtected, sender);
      check(retained.candidates(1).every(c => c.source.configUrl === configUrl) &&
        retained.candidates(1).some(c => c.status === 'found'),
        'inline candidate protection cannot revoke an independent fetched source at the same URL');
      await protecting;
      const sourceRemoved = retained.publish(reference, sender);
      check(retained.candidates(1).length === 0, 'removing one config reference prunes only that source');
      await sourceRemoved;
      const old = state.publish(message, sender);
      check(state.frames(1)[0].status === 'pending', 'pending transition');
      const fresh = state.publish(message, sender);
      jobs[1].resolve(resolved('20', sender.url)); await fresh;
      jobs[0].resolve(resolved('99', sender.url)); await old;
      check(state.candidates(1)[0].videoId === '20', 'replacement beats held completion');
      const second = { ...sender, frameId: 2, documentId: 'b', url: 'https://player.vimeo.com/video/21' };
      state.activate(1, 2, 'b');
      const duplicate = state.publish(message, second);
      jobs[2].resolve([...resolved('20', second.url), ...resolved('21', second.url)]); await duplicate;
      check(state.videoCount(1) === 2 && state.candidates(1).length === 3 && new Set(state.candidates(1).map(candidate => candidate.id)).size === 3,
        'same-video candidates from different documents survive');
      state.remove(1, 0, 'a');
      check(state.candidates(1)[0].source.frameUrl === second.url, 'surviving frame provenance');
      const other = { ...sender, tab: { id: 2 } }; state.activate(2, 0, 'a');
      const isolated = state.publish(message, other); jobs[3].resolve(resolved('77', sender.url)); await isolated;
      for (const action of ['activate', 'remove', 'clearTab']) {
        state.activate(1, 2, 'b'); const held = state.publish(message, second);
        const job = jobs.at(-1);
        if (action === 'activate') state.activate(1, 2, 'new');
        if (action === 'remove') state.remove(1, 2, 'b');
        if (action === 'clearTab') state.clearTab(1);
        job.resolve(resolved('88', second.url)); await held;
        check(state.videoCount(1) === 0 && state.candidates(1).length === 0, action + ' blocks resurrection');
        check(state.videoCount(2) === 1 && state.candidates(2)[0].videoId === '77', 'tab isolation');
      }
      check(!await state.publish(message, second), 'no implicit reactivation');
      state.activate(1, 2, 'b'); const failed = state.publish(message, second);
      jobs.at(-1).reject(new Error('https://signed.invalid/?secret')); await failed;
      check(state.frames(1)[0].status === 'error' && !JSON.stringify(state.frames(1)).includes('secret'), 'redacted error transition');
      const rebuilt = state.publish(message, second); jobs.at(-1).resolve(resolved('21', second.url)); await rebuilt;
      state.remove(1, 2, 'old');
      check(state.candidates(1)[0].videoId === '21', 'fresh rebuild and old disconnect ignored');
      const copy = state.candidates(1); copy[0].videoId = 'mutated';
      check(state.candidates(1)[0].videoId === '21', 'snapshot isolation');
      const otherFrame = { ...sender, frameId: 3, documentId: 'same-url' };
      state.activate(1, 3, 'same-url');
      const sameUrl = state.publish(message, otherFrame);
      jobs.at(-1).resolve(resolved('21', second.url)); await sameUrl;
      const kept = state.candidates(1);
      check(state.videoCount(1) === 1 && kept.length === 2 && kept[0].id !== kept[1].id
        && kept[0].frameId === 2 && kept[1].frameId === 3
        && kept[1].documentId === 'same-url', 'identical source URLs retain document identity');
      state.remove(1, 3, 'same-url');
      check(state.candidates(1).length === 1 && state.candidates(1)[0].frameId === 2, 'only removed document disappears');
      return 'sender boundary, replacement, candidate identity, isolation, invalidation, errors, rebuild passed';
    }, actual.sender);
    assert.match(result, /rebuild passed/);
    console.log(result);
  } finally {
    await context?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

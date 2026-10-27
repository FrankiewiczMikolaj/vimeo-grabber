import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'vite';

import process from 'node:process';
test('admitted inline alternatives reach owned metadata without fetching unsupported hosts', async () => {
  const bundle = await build({ configFile: false, logLevel: 'silent', build: {
    lib: { entry: ['src/detect/frame-state.ts', 'src/detect/normalise.ts', 'src/detect/resolve.ts'], formats: ['es'] }, write: false,
  } });
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const dir = await mkdtemp(`${process.cwd()}/.composition-`);
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  try {
    const output = (Array.isArray(bundle) ? bundle[0] : bundle).output;
    for (const item of output) await writeFile(`${dir}/${item.fileName}`, item.code);
    const { normalisePlayerConfig } = await import(`${dir}/normalise.js`);
    const { createFrameState } = await import(`${dir}/frame-state.js`);
    const { resolveDiscovery } = await import(`${dir}/resolve.js`);
    const sender = { id: 'extension', tab: { id: 7 }, frameId: 2, documentId: 'live',
      documentLifecycle: 'active', origin: 'https://player.vimeo.com', url: 'https://player.vimeo.com/video/20' };
    const video = normalisePlayerConfig({ video: { id: 20, title: 'Owned fallback' }, request: { files: { hls: {
      default_cdn: 'unsupported', cdns: { unsupported: { url: 'https://unsupported.example/master.m3u8' },
        owned: { url: 'https://owned.vimeocdn.com/master.m3u8' } },
    } } } }, { frameUrl: sender.url, configUrl: null });
    const requests = [];
    globalThis.chrome = { permissions: { contains: async () => true } };
    globalThis.fetch = async url => {
      requests.push(url);
      return new globalThis.Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\nvideo.m3u8', {
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
      });
    };
    const state = createFrameState('extension', resolveDiscovery);
    state.activate(7, 2, 'live');
    assert.equal(await state.publish({ type: 'frame-discovery', discovery: { videos: [video], configUrls: [] } }, sender), true);
    assert.deepEqual(state.candidates(7).map(candidate => candidate.status), ['unavailable', 'found']);
    assert.equal(state.candidates(7)[1].tracks[0].height, 360);
    assert.deepEqual(requests, ['https://owned.vimeocdn.com/master.m3u8']);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});

/* global Resolver, chrome */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { URL } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright';
import { build } from 'vite';
import { avcConfig, dashAvcResponse } from './fixtures/dash-avc-response.mjs';

const frameUrl = 'https://vimeo.com/900001';
const cdn = 'https://owned.vimeocdn.com';
const reference = (path, protocol = 'dash') => ({ protocol, cdn: 'owned', url: `${cdn}/${path}?sig=dummy%2Bsecret&x=1+2` });
const inline = (id, manifests) => ({ id, title: `Video ${id}`, source: { frameUrl, configUrl: null }, status: 'found', manifests, tracks: [] });
const config = (id, suffix = '') => `https://player.vimeo.com/video/${id}/config${suffix}`;

test('compiled discovery resolver uses finite metadata fallback and real Chromium permissions', { timeout: 60_000 }, async () => {
  const root = resolve('artifacts/resolver');
  await mkdir(root, { recursive: true });
  const extension = await mkdtemp(`${root}/extension-`);
  const profile = await mkdtemp(`${root}/profile-`);
  let context;
  const requests = [];
  const diagnostics = [];
  const dash = reference('master.json');
  const hls = reference('master.m3u8', 'hls');
  const mpd = reference('master.mpd');
  const denied = { ...dash, url: 'https://denied.vimeocdn.com/master.json?sig=dummy' };
  const bodies = new Map([
    [dash.url, ['application/json', JSON.stringify({ video: [{ id: 'v720', width: 1280, height: 720, bitrate: 2000000, codecs: 'avc1' }], audio: [{ id: 'a-fr', lang: 'fr', channels: 2 }] })]],
    [hls.url, ['application/vnd.apple.mpegurl', '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,AUDIO="audio"\nvideo.m3u8']],
    [mpd.url, ['application/dash+xml', '<MPD><Period><AdaptationSet contentType="audio" lang="de"><Representation id="a-de" bandwidth="96000"/></AdaptationSet></Period></MPD>']],
    [reference('protected.mpd').url, ['application/dash+xml', '<MPD><Period><AdaptationSet><ContentProtection schemeIdUri="urn:dummy"/></AdaptationSet></Period></MPD>']],
    [reference('unsupported.json').url, ['application/json', '{}']],
    [reference('broken.json').url, ['application/json', '{']],
    [config('900001'), ['application/json', JSON.stringify({ video: { id: 900001 }, request: { files: { hls: { cdns: { owned: { url: hls.url } } } } } })]],
    [config('900008'), ['application/json', JSON.stringify(avcConfig)]],
    [config('900002', '?attempt=1'), ['application/json', '{']],
    [config('900002', '?attempt=2'), ['application/json', JSON.stringify({ video: { id: 900002 }, request: { files: { hls: { cdns: { owned: { url: hls.url } } } } } })]],
    [config('900009'), ['application/json', JSON.stringify({ ...avcConfig, video: { id: 900009 }, drm: { enabled: true } })]],
  ]);
  for (const [address, body] of [...bodies]) {
    if (new URL(address).origin === cdn && new URL(address).pathname.endsWith('.json')) {
      bodies.delete(address);
      bodies.set(`${address}&base64_init=1`, body);
    }
  }
  const fixtureUrls = Object.values(avcConfig.request.files.dash.cdns).flatMap(entry => [entry.url, entry.avc_url]);
  const allowedAvc = new Set([...fixtureUrls, ...fixtureUrls.filter(url => !url.includes('base64_init=')).map(url => `${url}&base64_init=1`)]);
  try {
    await build({ configFile: false, logLevel: 'error', build: { outDir: extension, emptyOutDir: false,
      lib: { entry: resolve('src/detect/resolve.ts'), name: 'Resolver', formats: ['iife'], fileName: () => 'worker.js' } } });
    await writeFile(`${extension}/manifest.json`, JSON.stringify({ manifest_version: 3, name: 'Offline resolver proof', version: '1.0',
      background: { service_worker: 'worker.js' }, host_permissions: ['https://player.vimeo.com/*', `${cdn}/*`, 'https://second.vimeocdn.com/*'],
      optional_host_permissions: ['https://denied.vimeocdn.com/*'] }));
    context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    worker.on('console', message => diagnostics.push(message.text()));
    const cdp = await context.browser().newBrowserCDPSession();
    const { targetInfos } = await cdp.send('Target.getTargets');
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: targetInfos.find(item => item.type === 'service_worker').targetId, flatten: false });
    let id = 0;
    const pending = new Map();
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const key = ++id;
      pending.set(key, { resolve, reject });
      void cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id: key, method, params }) }).catch(reject);
    });
    cdp.on('Target.receivedMessageFromTarget', event => {
      if (event.sessionId !== sessionId) return;
      const message = JSON.parse(event.message);
      if (message.id) {
        const waiter = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) waiter.reject(new Error(message.error.message));
        else waiter.resolve(message.result);
      }
      if (message.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = message.params;
      requests.push(request.url);
      if (allowedAvc.has(request.url)) {
        void command('Fetch.fulfillRequest', { requestId, responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify(dashAvcResponse(request.url))).toString('base64') });
        return;
      }
      const body = bodies.get(request.url);
      if (!body) { void command('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }); return; }
      void command('Fetch.fulfillRequest', { requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: body[0] }], body: Buffer.from(body[1]).toString('base64') });
    });
    await command('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    const videos = [inline('900001', [hls, dash, denied, reference('protected.mpd'), reference('broken.json')]),
      inline('900002', [reference('broken.json'), denied]), inline('900006', [mpd])];
    const configUrls = [config('900001'), config('900002', '?attempt=1'), config('900002', '?attempt=2'), config('900002', '?attempt=2')];
    const result = await worker.evaluate(({ discovery, frameUrl }) => Resolver.resolveDiscovery(discovery, frameUrl), { discovery: { videos, configUrls }, frameUrl });
    assert.deepEqual(result.map(item => item.status), [
      'found', 'found', 'permission-needed', 'protected', 'unsupported',
      'unsupported', 'permission-needed', 'found', 'found', 'unavailable', 'found',
    ]);
    assert.equal(new Set(result.map(item => item.id)).size, result.length);
    const tracks = result[1].tracks;
    assert.deepEqual(tracks.map(({ id, kind, width, height, bandwidth, language, channels, codec }) =>
      ({ id, kind, width, height, bandwidth, language, channels, codec })), [
      { id: 'v720', kind: 'video', width: 1280, height: 720, bandwidth: 2000000, language: null, channels: null, codec: 'avc1' },
      { id: 'a-fr', kind: 'audio', width: null, height: null, bandwidth: null, language: 'fr', channels: '2', codec: null },
    ]);
    assert.deepEqual(tracks.map(track => track.manifest), [dash, dash]);
    assert.deepEqual(result[0].tracks.map(track => track.manifest), [hls, hls]);
    assert.deepEqual(result[7].tracks.map(track => [track.id, track.kind, track.language, track.manifest]), [['a-de', 'audio', 'de', mpd]]);
    assert.equal(result[8].source.configUrl, config('900001'));
    assert.equal(result[10].source.configUrl, config('900002', '?attempt=2'));
    assert.deepEqual(result[10].tracks.map(track => track.manifest), [hls, hls]);
    assert.deepEqual(result.map(item => item.permissionOrigins),
      [[], [], ['https://denied.vimeocdn.com'], [], [], [], ['https://denied.vimeocdn.com'], [], [], [], []]);
    assert.deepEqual(requests, [hls.url, `${dash.url}&base64_init=1`, reference('protected.mpd').url, `${reference('broken.json').url}&base64_init=1`,
      `${reference('broken.json').url}&base64_init=1`, mpd.url, config('900001'), hls.url,
      config('900002', '?attempt=1'), config('900002', '?attempt=2'), hls.url]);
    const repairStart = requests.length;
    const repaired = await worker.evaluate(({ configUrl, frameUrl }) => Resolver.resolveDiscovery(
      { videos: [], configUrls: [configUrl] }, frameUrl), { configUrl: config('900008'), frameUrl });
    const alternatives = avcConfig.request.files.dash.cdns;
    const originalUrls = [alternatives.separate.avc_url, alternatives.separate.url,
      alternatives.backup.avc_url, alternatives.backup.url];
    assert.deepEqual(repaired.map(candidate => candidate.manifest.url), originalUrls);
    assert.deepEqual(repaired.map(candidate => candidate.status), ['found', 'found', 'found', 'found']);
    assert.deepEqual(repaired.map(candidate => candidate.tracks[0].codec),
      ['avc1.4d401e', 'av01.0.08M.08', 'avc1.4d401e', 'av01.0.08M.08']);
    assert.deepEqual(requests.slice(repairStart), [config('900008'),
      `${originalUrls[0]}&base64_init=1`, `${originalUrls[1]}&base64_init=1`, originalUrls[2], originalUrls[3]]);
    assert.ok(repaired.every(candidate => candidate.tracks.every(track =>
      JSON.stringify(track.manifest) === JSON.stringify(candidate.manifest) && track.download.reason !== 'protected')));
    assert.equal(dashAvcResponse(originalUrls[3]).video[0].init_segment, undefined);
    assert.ok(dashAvcResponse(requests[repairStart + 1]).video[0].init_segment);
    const protectedStart = requests.length;
    const protectedConfig = await worker.evaluate(({ configUrl, frameUrl }) => Resolver.resolveDiscovery(
      { videos: [], configUrls: [configUrl] }, frameUrl), { configUrl: config('900009'), frameUrl });
    assert.deepEqual(protectedConfig.map(candidate => [candidate.status, candidate.tracks]), Array(4).fill(['protected', []]));
    assert.deepEqual(requests.slice(protectedStart), [config('900009')], 'explicit protected configs do not fetch manifests');
    assert.equal(diagnostics.some(text => /dummy|sig=/.test(text)), false);
    assert.equal(await worker.evaluate(() => typeof chrome.downloads), 'undefined');
    const unavailable = await worker.evaluate(frameUrl => Resolver.resolveDiscovery({ videos: [], configUrls: ['https://player.vimeo.com/video/900007/config'] }, frameUrl), frameUrl);
    assert.equal(unavailable[0].status, 'unavailable');
    assert.equal(await worker.evaluate(async ({ videos }) => (await Resolver.resolveDiscovery({ videos, configUrls: [] }, 'https://vimeo.com/other')).length, { videos }), 0);
    await writeFile(`${root}/evidence.json`, JSON.stringify({ statuses: result.map(item => item.status),
      avc: repaired.map(candidate => ({ status: candidate.status, cdn: candidate.manifest.cdn,
        path: new URL(candidate.manifest.url).pathname, codec: candidate.tracks[0].codec })),
      requests: requests.map(url => url.split('?')[0]), permissionOrigins: result.map(item => item.permissionOrigins), signedQueryDiagnostics: false }, null, 2));
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
    await rm(extension, { recursive: true, force: true });
  }
});

/* global Metadata, transport, source, receipt, video, chrome */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { URL } from 'node:url';
import { chromium } from 'playwright';
import { build } from 'vite';

test('compiled metadata transport enforces real worker permissions and bounded provenance', { timeout: 60_000 }, async () => {
  const root = resolve('artifacts/metadata');
  await mkdir(root, { recursive: true });
  const extension = await mkdtemp(`${root}/extension-`);
  const profile = await mkdtemp(`${root}/profile-`);
  let context;
  const seen = [];
  const evidence = [];
  try {
    await build({ configFile: false, logLevel: 'error', build: {
      outDir: extension, emptyOutDir: false, lib: {
        entry: resolve('src/detect/metadata.ts'), name: 'Metadata', formats: ['iife'], fileName: () => 'worker.js',
      },
    } });
    await writeFile(`${extension}/manifest.json`, JSON.stringify({
      manifest_version: 3, name: 'Owned metadata transport proof', version: '1.0',
      background: { service_worker: 'worker.js' },
      host_permissions: ['https://player.vimeo.com/*', 'https://owned.vimeocdn.com/*'],
      optional_host_permissions: ['https://denied.vimeocdn.com/*'],
    }));
    context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const cdp = await context.browser().newBrowserCDPSession();
    const { targetInfos } = await cdp.send('Target.getTargets');
    const target = targetInfos.find(item => item.type === 'service_worker');
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
    let id = 0;
    const pending = new Map();
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const key = ++id;
      pending.set(key, { resolve, reject });
      cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id: key, method, params }) }).catch(reject);
    });
    let mode = 'ok';
    const manifest = 'https://owned.vimeocdn.com/manifest.mpd?sig=dummy%2Bsecret&x=1+2';
    const config = { video: { id: 900001 }, request: { files: { dash: { cdns: {
      owned: { url: manifest }, denied: { url: 'https://denied.vimeocdn.com/manifest.mpd' },
      media: { url: 'https://owned.vimeocdn.com/segment.m4s' },
      json: { url: 'https://owned.vimeocdn.com/manifest.json?sig=dummy%2f+%20&x=&x=2' },
    } } } } };
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
      seen.push(request);
      if (mode === 'timeout') return;
      const isConfig = new URL(request.url).hostname === 'player.vimeo.com';
      if (mode === 'network') {
        void command('Fetch.failRequest', { requestId, errorReason: 'Failed' });
        return;
      }
      const body = mode === 'size' ? 'x'.repeat(1_048_577)
        : mode === 'malformed' ? '{' : isConfig ? JSON.stringify(config)
          : new URL(request.url).pathname.endsWith('.json') ? '{"video":[{"id":"v"}]}' : '<MPD/>';
      void command('Fetch.fulfillRequest', { requestId, responseCode: mode === 'http' ? 403 : mode === 'redirect' ? 302 : 200,
        responseHeaders: [{ name: 'Content-Type', value: mode === 'type' ? 'video/mp4' : isConfig || new URL(request.url).pathname.endsWith('.json') ? 'application/json' : 'application/dash+xml' },
          ...(mode === 'redirect' ? [{ name: 'Location', value: 'https://unrelated.invalid/secret' }] : [])],
        body: Buffer.from(body).toString('base64'),
      });
    });
    await command('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    await worker.evaluate(() => {
      globalThis.transport = new Metadata.MetadataTransport();
      globalThis.source = { frameUrl: 'https://player.vimeo.com/video/900001',
        configUrl: 'https://player.vimeo.com/video/900001/config?h=dummy%2Bsecret&x=1+2' };
    });
    assert.equal(await worker.evaluate(() => typeof chrome.downloads), 'undefined');
    const load = () => worker.evaluate(async () => {
      globalThis.receipt = await transport.config(source);
      return receipt;
    });
    assert.equal((await load()).status, 'fetched');
    assert.equal(seen[0].url, 'https://player.vimeo.com/video/900001/config?h=dummy%2Bsecret&x=1+2');
    await worker.evaluate(config => {
      globalThis.video = { id: '900001', title: null, status: 'found', tracks: [], source, manifests: Object.entries(config.request.files.dash.cdns)
        .map(([cdn, item]) => ({ cdn, protocol: 'dash', url: item.url })) };
    }, config);
    const fetchManifest = index => worker.evaluate(index => transport.manifest(receipt, video, video.manifests[index]), index);
    assert.equal((await fetchManifest(0)).text, '<MPD/>');
    assert.equal(seen[1].url, manifest);
    assert.equal((await fetchManifest(3)).status, 'fetched');
    assert.equal(seen[2].url, `${config.request.files.dash.cdns.json.url}&base64_init=1`);
    assert.deepEqual(await worker.evaluate(() => transport.manifest(receipt, video, {
      ...video.manifests[3], url: `${video.manifests[3].url}&base64_init=1`,
    })), { status: 'failed', reason: 'source' });
    assert.deepEqual(await fetchManifest(1), { status: 'permission-needed', origin: 'https://denied.vimeocdn.com' });
    const count = seen.length;
    assert.deepEqual(await fetchManifest(2), { status: 'failed', reason: 'source' });
    assert.deepEqual(await worker.evaluate(() => transport.manifest({ ...receipt }, video, video.manifests[0])), { status: 'failed', reason: 'source' });
    assert.deepEqual(await worker.evaluate(() => transport.manifest(receipt, video, { ...video.manifests[0], url: 'https://owned.vimeocdn.com/unrelated.mpd' })), { status: 'failed', reason: 'source' });
    assert.equal(await worker.evaluate(() => transport.inline({ ...video, id: 'invalid', source: { ...source, configUrl: null } })), null);
    for (const url of ['http://player.vimeo.com/video/900001/config', 'https://user:pass@player.vimeo.com/video/900001/config',
      'https://player.vimeo.com/video/900001/media', 'https://player.vimeo.com.evil.invalid/video/900001/config']) {
      assert.deepEqual(await worker.evaluate(url => transport.config({ ...source, configUrl: url }), url), { status: 'failed', reason: 'source' });
    }
    assert.equal(seen.length, count, 'rejected sources and denied permissions must issue no request');
    evidence.push('real optional-origin denial; forged receipt/reference; unsafe URL and media rejection; exact query preservation');
    const beforeInline = seen.length;
    assert.equal(await worker.evaluate(async () => {
      const inline = transport.inline({ ...video, source: { ...source, configUrl: null } });
      return (await transport.manifest(inline, inline.video, inline.video.manifests[0])).status;
    }), 'fetched');
    assert.equal(seen.length, beforeInline + 1, 'inline provenance must not require a config HTTP request');
    evidence.push('inline config authorizes its manifest without config HTTP');
    assert.deepEqual(await worker.evaluate(async () => {
      const original = { ...video, source: { ...source, configUrl: null }, manifests: [{ ...video.manifests[0] }] };
      const inline = transport.inline(original);
      original.manifests[0].url = 'https://owned.vimeocdn.com/unrelated.mpd';
      inline.video.manifests[0].url = original.manifests[0].url;
      return transport.manifest(inline, inline.video, inline.video.manifests[0]);
    }), { status: 'failed', reason: 'source' });
    for (const reason of ['redirect', 'http', 'content-type', 'size', 'timeout', 'network']) {
      mode = reason === 'content-type' ? 'type' : reason;
      assert.deepEqual(await load(), { status: 'failed', reason });
      evidence.push(reason);
    }
    mode = 'malformed';
    assert.equal((await load()).status, 'fetched', 'transport success is not parsing success');
    assert.deepEqual(await fetchManifest(0), { status: 'failed', reason: 'source' });
    const workerUrl = worker.url();
    await context.close();
    await writeFile(`${extension}/manifest.json`, JSON.stringify({
      manifest_version: 3, name: 'Owned permission denial proof', version: '1.0',
      background: { service_worker: 'worker.js' },
    }));
    context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
    const deniedWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    assert.deepEqual(await deniedWorker.evaluate(() => new Metadata.MetadataTransport().config({
      frameUrl: 'https://player.vimeo.com/video/900001', configUrl: 'https://player.vimeo.com/video/900001/config',
    })), { status: 'permission-needed', origin: 'https://player.vimeo.com' });
    for (const request of seen) {
      assert.match(request.url, /^https:\/\/(player\.vimeo\.com\/video\/900001\/config|owned\.vimeocdn\.com\/manifest\.(mpd|json))\?/);
      assert.equal(request.method, 'GET');
      assert.equal(Object.keys(request.headers).some(key => /^(cookie|authorization|referer)$/i.test(key)), false);
    }
    evidence.push('malformed config remains fetched but cannot authorize manifests; real config permission denial; metadata-only GET without credentials');
    await writeFile(`${root}/evidence.json`, JSON.stringify({ worker: workerUrl, evidence, requests: seen.length }, null, 2));
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
    await rm(extension, { recursive: true, force: true });
  }
});

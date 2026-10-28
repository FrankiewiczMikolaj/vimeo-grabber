import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { normalisePlayerConfig } from '../src/detect/normalise.ts';

const configs = JSON.parse(await readFile(new URL('./fixtures/player-configs.json', import.meta.url), 'utf8'));
const source = { frameUrl: 'https://player.vimeo.com/video/900001', configUrl: null };
const normalise = config => normalisePlayerConfig(config, source);

test('owned config preserves identity, provenance, preferred CDN and every signed alternative', () => {
  const result = normalise(configs[0]);
  assert.equal(result.id, '900001');
  assert.equal(result.title, 'Owned river study');
  assert.deepEqual(result.source, source);
  assert.equal(result.status, 'found');
  const files = configs[0].request.files;
  assert.deepEqual(result.manifests, [
    { protocol: 'dash', cdn: 'primary', url: files.dash.cdns.primary.avc_url },
    { protocol: 'dash', cdn: 'primary', url: files.dash.cdns.primary.url },
    { protocol: 'dash', cdn: 'backup', url: files.dash.cdns.backup.url },
    { protocol: 'hls', cdn: 'primary', url: files.hls.cdns.primary.url },
  ]);
  assert.deepEqual(result.tracks, []);
});

test('malformed preferred source cannot erase DASH or HLS alternatives or invent a title', () => {
  const result = normalise(configs[1]);
  assert.equal(result.id, '900002');
  assert.equal(result.title, null);
  assert.deepEqual(result.manifests.map(item => item.url), [
    configs[1].request.files.dash.cdns.alternate.url,
    configs[1].request.files.hls.cdns.alternate.url,
  ]);
});

test('changed input drives output without mutation or guessed progressive qualities', () => {
  const input = JSON.parse(JSON.stringify(configs[0]));
  input.video = { id: '98765432109876543210', title: 'Changed title' };
  input.request.files.dash.cdns.primary.url = 'https://other.vimeocdn.com/new.mpd?sig=%2f+%3d&x=&x=2';
  const before = JSON.parse(JSON.stringify(input));
  const result = normalise(input);
  assert.equal(result.id, input.video.id);
  assert.equal(result.title, input.video.title);
  assert.ok(result.manifests.some(reference => reference.url === input.request.files.dash.cdns.primary.url));
  assert.deepEqual(input, before);
  assert.deepEqual(normalise(configs[2]), {
    id: '900003', title: 'Owned progressive-only study', source,
    status: 'unavailable', manifests: [], tracks: [],
  });
});

test('unsupported roots, identities and fields cannot fabricate metadata', () => {
  for (const value of [null, [], {}, { video: null }, { video: [] }]) assert.equal(normalise(value), null);
  for (const id of [null, '', ' ', '12x', '0', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(normalise({ video: { id } }), null);
  }
  for (const url of ['http://example.com/a', '//example.com/a', 'not a URL',
    'https://user:pass@example.com/a', '', 7, null]) {
    const result = normalise({ video: { id: 1, title: 42 }, request: { files: {
      dash: { cdns: { broken: { url } } }, hls: [],
    } } });
    assert.equal(result.title, null);
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(result.manifests, []);
  }
});

test('only positive config protection declarations suppress clear alternatives', () => {
  assert.equal(normalise({ ...configs[0], drm: { enabled: false, widevine: {} } }).status, 'found');
  for (const config of [
    { ...configs[0], drm: { enabled: true } },
    { ...configs[0], video: { ...configs[0].video, encrypted: true } },
  ]) {
    const result = normalise(config);
    assert.equal(result.status, 'protected');
    assert.equal(result.manifests.length, 4);
  }
});

test('request DRM needs HLS scope or an exact encrypted HLS candidate match', () => {
  const url = 'https://owned.vimeocdn.com/clear.m3u8';
  const make = (drm, encryptedUrl) => ({ video: { id: 1 }, request: { drm, files: {
    hls: { cdns: { owned: { url } } },
    hls_cenc: { cdns: { owned: { url: encryptedUrl } } },
  } } });
  assert.equal(normalise(make({ widevine: { license_url: 'https://license.invalid' } }, url + '?other')).manifests[0].protected, undefined);
  assert.equal(normalise(make({ hls: { enabled: false } }, url + '?other')).manifests[0].protected, undefined);
  assert.equal(normalise(make({ hls: { fairplay: true } }, url + '?other')).manifests[0].protected, true);
  assert.equal(normalise(make({ fairplay: true }, url)).manifests[0].protected, true);
});

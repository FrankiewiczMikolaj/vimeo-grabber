import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { parseDashJson } from '../src/detect/dash-json.ts';

const fixture = JSON.parse(await readFile(new URL('./fixtures/dash-json.json', import.meta.url), 'utf8'));
const manifest = { protocol: 'dash', cdn: 'owned', url: 'https://origin.example.invalid/original.json?sig=source%2f' };
const response = 'https://edge.example.invalid/path/dash/master.json?sig=response';
const parse = input => parseDashJson(input, manifest, response);

test('owned multi-quality manifest exposes exact independent metadata and original provenance', () => {
  const before = JSON.parse(JSON.stringify(fixture));
  const result = parse(fixture);
  assert.equal(result.status, 'found');
  const expected = [
    ['video-360', 'video', 'avc1.4d401e', 'video/mp4', 650000, 640, 360, 29.97, null, null, 'v360/?sig=owned%2f+%3d&x=&x=2'],
    ['video-1080', 'video', 'avc1.640028', 'video/mp4', 4200000, 1920, 1080, 60, null, null, 'https://video.example.invalid/1080/'],
    ['audio-en', 'audio', 'mp4a.40.2', 'audio/mp4', 128000, null, null, null, 'en', '2', 'a-en/'],
    ['audio-pl', 'audio', 'mp4a.40.2', 'audio/mp4', 192000, null, null, null, 'pl', '5.1', 'a-pl/'],
  ].map(([id, kind, codec, mimeType, bandwidth, width, height, frameRate, language, channels, uri]) => ({
    id, kind, codec, mimeType, bandwidth, width, height, frameRate, language, channels,
    groupId: null, manifest, baseUrl: new URL(uri, 'https://edge.example.invalid/path/media/').href, protected: false,
  }));
  assert.deepEqual(result.tracks, expected);
  assert.deepEqual(fixture, before);
});

test('malformed entries do not hide siblings; unknown and invalid metadata stays null', () => {
  const result = parse({ video: [null, [], {}, { id: ' ' }, { id: false }, { id: 0 },
    { id: 'unknown', width: -1, height: 1.5, framerate: '60', bitrate: Infinity, codecs: [], mime_type: 5 },
    fixture.video[0]], audio: [{ id: 7, lang: {}, channels: -2 }], extra: fixture });
  assert.equal(result.status, 'found');
  assert.deepEqual(result.tracks[0], {
    id: 'unknown', groupId: null, kind: 'video', manifest, codec: null, mimeType: null,
    bandwidth: null, width: null, height: null, frameRate: null, language: null, channels: null,
    baseUrl: response, protected: false,
  });
  assert.deepEqual(result.tracks.slice(1).map(t => t.id), ['video-360', '7']);
  assert.equal(result.tracks[2].language, null);
  assert.equal(result.tracks[2].channels, null);
  for (const input of [null, [], '<MPD/>', {}, { video: {} }]) assert.equal(parse(input).status, 'unsupported');
  assert.deepEqual(parse({ video: [null, {}], audio: [] }), { status: 'unavailable', tracks: [] });
});

test('base resolution follows URL query rules without inheriting or inventing credentials', () => {
  for (const [base_url, expected] of [
    [undefined, response], ['', response], ['?x=&x=2&sig=%2f+%3d', 'https://edge.example.invalid/path/dash/master.json?x=&x=2&sig=%2f+%3d'],
    ['../a/', 'https://edge.example.invalid/path/a/'], ['//cdn.example.invalid/a', 'https://cdn.example.invalid/a'],
    ['/root/', 'https://edge.example.invalid/root/'], ['#part', `${response}#part`],
    ['http://cdn.example.invalid/a', null], ['https://user:pass@cdn.example.invalid/a', null], [' data:x', null],
  ]) assert.equal(parse({ video: [{ id: 'v', base_url }] }).tracks[0].baseUrl, expected);
  assert.equal(parse({ base_url: 'http://invalid/', video: [{ id: 'v', base_url: 'relative/' }] }).tracks[0].baseUrl, null);
  assert.equal(parseDashJson({ video: [{ id: 'v' }] }, manifest).tracks[0].baseUrl, manifest.url);
  assert.equal(parseDashJson(fixture, manifest, 'not a URL').status, 'unsupported');
  assert.equal(parseDashJson(fixture, { ...manifest, protocol: 'hls' }).status, 'unsupported');
});

test('advertised protection remains explicit and does not discard clear siblings', () => {
  const result = parse({ video: [fixture.video[0], { ...fixture.video[1], drm: { widevine: { license_url: 'https://license.example.invalid/' } } }] });
  assert.equal(result.status, 'protected');
  assert.deepEqual(result.tracks.map(t => [t.id, t.protected]), [['video-360', false], ['video-1080', true]]);
  const inherited = parse({ ...fixture, content_protection: [{ scheme: 'owned-drm' }] });
  assert.equal(inherited.status, 'protected');
  assert.deepEqual(inherited.tracks.map(t => t.protected), [true, true, true, true]);
  assert.deepEqual(parse({ drm: { scheme: 'unknown' } }), { status: 'protected', tracks: [] });
  assert.equal(parse({ ...fixture, drm: {}, content_protection: [] }).status, 'found');
});

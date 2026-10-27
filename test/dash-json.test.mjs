import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { parseDashJson } from '../src/detect/dash-json.ts';

const fixture = JSON.parse(await readFile(new URL('./fixtures/dash-json.json', import.meta.url), 'utf8'));
const manifest = { protocol: 'dash', cdn: 'owned', url: 'https://origin.example.invalid/original.json?sig=source%2f' };
const response = 'https://edge.example.invalid/path/dash/master.json?sig=response';
const parse = input => parseDashJson(input, manifest, response);
const resource = (role, url) => ({ role, kind: 'url', url });

test('owned stacked resources preserve init-first ordering, signed queries and provenance', () => {
  const result = parse(fixture);
  assert.equal(result.status, 'found');
  assert.deepEqual(result.tracks.map(t => [t.id, t.kind, t.codec, t.height, t.language, t.channels]), [
    ['video-360', 'video', 'avc1.4d401e', 360, null, null],
    ['video-1080', 'video', 'avc1.640028', 1080, null, null],
    ['audio-en', 'audio', 'mp4a.40.2', null, 'en', '2'],
    ['audio-pl', 'audio', 'mp4a.40.2', null, 'pl', '5.1'],
  ]);
  assert.deepEqual(result.tracks[0].download, { kind: 'resources', resources: [
    { role: 'initialization', kind: 'inline-base64', data: 'aW5pdA==' },
    resource('media', 'https://edge.example.invalid/path/media/v360/segment-2.m4s'),
    resource('media', 'https://edge.example.invalid/path/media/v360/?sig=child%2f+%3d&x=&x=2'),
    resource('media', 'https://media.example.invalid/final.m4s?sig=absolute%2f'),
  ] });
  assert.deepEqual(result.tracks[1].download, { kind: 'resources', resources: [
    resource('initialization', 'https://video.example.invalid/1080/init.mp4?sig=init%2f'),
    resource('media', 'https://video.example.invalid/1080/one.m4s'),
  ] });
  assert.deepEqual(result.tracks[2].download.resources, [
    { role: 'initialization', kind: 'inline-base64', data: 'aW5pdA==' },
    resource('media', 'https://edge.example.invalid/path/media/a-en/audio.m4s'),
  ]);
  for (const track of result.tracks) assert.deepEqual(track.manifest, manifest);
});

test('empty, relative and explicit queries follow URL semantics through every layer', () => {
  for (const [base_url, segment, expected] of [
    [undefined, '', response], ['', '?x=&x=2&sig=%2f+%3d', 'https://edge.example.invalid/path/dash/master.json?x=&x=2&sig=%2f+%3d'],
    ['../a/?parent=1', 'child.m4s', 'https://edge.example.invalid/path/a/child.m4s'],
    ['//cdn.example.invalid/a/', '/root.m4s', 'https://cdn.example.invalid/root.m4s'],
  ]) {
    const track = parse({ video: [{ id: 'v', base_url, init_segment: 'aW5pdA==', segments: [{ url: segment }] }] }).tracks[0];
    assert.equal(track.download.resources[1].url, expected);
  }
});

test('unknown, unsafe and missing initialization stay unavailable, never DRM', () => {
  for (const [entry, reason] of [
    [{}, 'missing-initialization'], [{ init_segment: '' }, 'missing-initialization'],
    [{ init_segment: 'not-base64' }, 'unsafe'], [{ init_segment: 'aW5pdA==' }, 'unknown'],
    [{ init_segment: 'aW5pdA==', segments: [{ url: 'http://unsafe.invalid/one' }] }, 'unsafe'],
    [{ init_segment: 'aW5pdA==', base_url: 'https://user:pass@unsafe.invalid/' }, 'unsafe'],
    [{ init_segment: 'aW5pdB==', segments: [{ url: 'one.m4s' }] }, 'unsafe'],
    [{ init_segment: Buffer.alloc(65_537, 'x').toString('base64'), segments: [{ url: 'one.m4s' }] }, 'unsupported'],
  ]) {
    const result = parse({ video: [{ id: 'v', ...entry }] });
    assert.equal(result.status, 'found');
    assert.deepEqual(result.tracks[0].download, { kind: 'unavailable', reason });
  }
  const invalidBase = parse({ base_url: 'http://unsafe.invalid/', video: [fixture.video[1]] });
  assert.equal(invalidBase.tracks[0].download.reason, 'unsafe');
  for (const input of [null, [], '<MPD/>', {}, { video: {} }]) assert.equal(parse(input).status, 'unsupported');
  assert.equal(parseDashJson(fixture, manifest, 'invalid').status, 'unsupported');
  const mixed = parse({ video: [null, {}, { id: 'v', width: -1 }, fixture.video[0]] });
  assert.deepEqual(mixed.tracks.map(t => [t.id, t.width]), [['v', null], ['video-360', 640]]);
});

test('positive protection blocks resources while missing init and inactive DRM do not', () => {
  for (const indication of [{ encrypted: true }, { encryption: { scheme: 'cenc' } },
    { encryption: { method: 'AES-128' } }, { drm: true }, { content_protection: [{ scheme: 'owned' }] }]) {
    const root = parse({ ...fixture, ...indication });
    assert.equal(root.status, 'protected');
    assert.ok(root.tracks.every(t => t.download.reason === 'protected'));
    const mixed = parse({ video: [fixture.video[0], { ...fixture.video[1], ...indication }] });
    assert.equal(mixed.status, 'protected');
    assert.deepEqual(mixed.tracks.map(t => t.download.kind), ['resources', 'unavailable']);
  }
  for (const init_segment of [undefined, '', 'aW5pdA==']) {
    const result = parse({ drm: { enabled: false, widevine: {}, playready: null },
      content_protection: [{ scheme: '', encrypted: false }], encryption: { enabled: false },
      video: [{ ...fixture.video[0], init_segment, drm: { enabled: false } }] });
    assert.equal(result.status, 'found');
    assert.notEqual(result.tracks[0].download.reason, 'protected');
  }
});

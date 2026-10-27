import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { parseHls } from '../src/detect/hls.ts';

const manifest = Object.freeze({ protocol: 'hls', cdn: 'owned', url: 'https://owned.vimeocdn.com/original.m3u8?sig=original' });
const base = 'https://owned.vimeocdn.com/path/master.m3u8?sig=base';
const fixture = await readFile(new URL('./fixtures/hls-master.m3u8', import.meta.url), 'utf8');
const variant = (attrs = '', uri = 'child.m3u8') => `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1200${attrs}\n${uri}`;

test('owned qualities link exact audio metadata and preserve provenance and query semantics', () => {
  const result = parseHls(fixture, manifest, base);
  assert.equal(result.status, 'found');
  assert.deepEqual(result.tracks.map(t => [t.id, t.kind, t.groupId, t.uri]), [
    ['variant:0', 'video', 'stereo', 'https://owned.vimeocdn.com/path/low/index.m3u8'],
    ['variant:1', 'video', 'stereo', 'https://owned.vimeocdn.com/high.m3u8?sig=explicit&empty='],
    ['audio:0', 'audio', 'stereo', 'https://owned.vimeocdn.com/audio/en.m3u8?sig=%2f+%3d&x=&x=2'],
    ['audio:1', 'audio', 'stereo', 'https://owned.vimeocdn.com/path/master.m3u8?audio=pl'],
  ]);
  assert.deepEqual(result.tracks.slice(0, 2).map(t => [t.width, t.height, t.frameRate, t.bandwidth, t.codec]), [
    [640, 360, 29.97, 1200000, 'avc1.4d401e,mp4a.40.2'],
    [1920, 1080, 60, 4800000, 'avc1.640028,mp4a.40.2'],
  ]);
  assert.deepEqual(result.audioGroups.map(g => [g.name, g.language, g.channels]), [
    ['English, original', 'en', '2'], ['Polish', 'pl', '6/JOC'],
  ]);
  for (const track of result.tracks) assert.equal(track.manifest, manifest);
  assert.equal(result.tracks[0].attributes['X-OWNED'], 'unknown, preserved');
  assert.equal(result.tracks[2].codec, null);
  assert.equal(result.tracks[2].bandwidth, null);
});

test('in-band, combined, audio-only and unknown variants never invent separate audio', () => {
  for (const [codecs, kind] of [['avc1.4d401e,mp4a.40.2', 'combined'], ['mp4a.40.2', 'audio'], ['avc1.4d401e', 'video'], ['future.codec', 'combined']]) {
    const result = parseHls(variant(`,CODECS="${codecs}"`), manifest);
    assert.deepEqual(result.tracks.map(t => t.kind), [kind]);
    assert.equal(result.tracks[0].width, null);
  }
  const result = parseHls('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="mux",NAME="Main",LANGUAGE="en"\n' +
    variant(',AUDIO="mux",CODECS="avc1.4d401e"').split('\n').slice(1).join('\n'), manifest);
  assert.deepEqual(result.tracks.map(t => t.kind), ['combined']);
  assert.equal(result.audioGroups[0].uri, null);
});

test('malformed playlists cannot yield successful partial metadata', () => {
  for (const input of ['', '<html>denied</html>', variant(',CODECS="unclosed'), variant(',BANDWIDTH=2'),
    variant(',AUDIO="missing"'), variant('', ''), variant('', 'javascript:alert(1)'),
    variant('', 'https://user:pass@example.com/list'), variant(',X=1,'),
    '#EXTM3U\n#EXT-X-STREAM-INF:CODECS="avc1"\nchild.m3u8', `${fixture}\nstray.m3u8`]) {
    assert.deepEqual(parseHls(input, manifest), { status: 'unavailable', tracks: [], audioGroups: [] });
  }
});

test('advertised protection is metadata, while media playlists and unsupported forms are not success', () => {
  for (const tag of ['KEY', 'SESSION-KEY']) {
    assert.equal(parseHls(`${variant()}\n#EXT-X-${tag}:METHOD=AES-128,URI="never-fetch.key"`, manifest).status, 'protected');
  }
  assert.equal(parseHls(`${variant()}\n#EXT-X-KEY:METHOD=NONE`, manifest).status, 'found');
  assert.equal(parseHls('#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nsegment.ts', manifest).status, 'unsupported');
  assert.equal(parseHls(`${variant()}\n#EXT-X-DEFINE:NAME="x",VALUE="y"`, manifest).status, 'unsupported');
});

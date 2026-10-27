import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { parseDashMpd } from '../src/detect/dash-mpd.ts';

const manifest = Object.freeze({ protocol: 'dash', cdn: 'owned', url: 'https://cdn.example/input.mpd?original=1' });
const response = 'https://cdn.example/redirect/manifest.mpd?response=1';
const xml = await readFile(new URL('./fixtures/dash-mpd.mpd', import.meta.url), 'utf8');
const wrap = body => `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period>${body}</Period></MPD>`;

test('namespaced MPD inherits metadata and resolves every BaseURL against response URL', () => {
  const result = parseDashMpd(xml, manifest, response);
  assert.equal(result.status, 'found');
  const [high, low, en, pl] = result.tracks;
  assert.deepEqual(high, {
    id: 'high', groupId: 'picture', kind: 'video', manifest,
    baseUrl: 'https://cdn.example/media/period/video/high.mp4?sig=%2f+&x=&x=2',
    codec: 'avc1.640028', mimeType: 'video/mp4', bandwidth: 5000000,
    width: 1920, height: 1080, frameRate: 30000 / 1001, language: null, channels: null,
  });
  assert.deepEqual([low.width, low.height, low.frameRate, low.codec, low.bandwidth, low.baseUrl],
    [640, 360, 24, 'avc1.42001e', 900000, 'https://cdn.example/media/period/video/?quality=low']);
  assert.deepEqual([en.kind, en.groupId, en.language, en.channels, en.codec, en.bandwidth],
    ['audio', 'sound', 'en', '2', 'mp4a.40.2', 128000]);
  assert.deepEqual([pl.language, pl.channels, pl.bandwidth, pl.baseUrl],
    ['pl', '6', null, 'https://cdn.example/audio/pl.mp4?token=dummy']);
  assert.equal(result.tracks.length, 4);
  for (const track of result.tracks) assert.equal(track.manifest, manifest);
});

test('unknowns stay null and missing IDs are stable without guessing media kind', () => {
  const input = wrap('<AdaptationSet contentType="audio"><Representation/></AdaptationSet>');
  const result = parseDashMpd(input, manifest);
  const track = result.tracks[0];
  assert.deepEqual(track, { id: 'mpd/0/0/0', groupId: null, kind: 'audio', manifest,
    baseUrl: manifest.url, codec: null, mimeType: null, bandwidth: null,
    width: null, height: null, frameRate: null, language: null, channels: null });
  assert.deepEqual(parseDashMpd(input, manifest), result);
  assert.equal(parseDashMpd(wrap('<AdaptationSet><Representation id="unknown"/></AdaptationSet>'), manifest).status, 'unsupported');
  assert.deepEqual(parseDashMpd('<MPD/>', manifest), { status: 'unavailable', tracks: [] });
});

test('protection at any declared level prevents usable unprotected results', () => {
  for (const input of [xml.replace('<d:Period>', '<d:ContentProtection/><d:Period>'),
    xml.replace('<d:BaseURL>video/', '<d:ContentProtection/><d:BaseURL>video/'),
    xml.replace('<d:Representation id="high" bandwidth="5000000">', '<d:Representation id="high" bandwidth="5000000"><d:ContentProtection/>')]) {
    assert.deepEqual(parseDashMpd(input, manifest), { status: 'protected', tracks: [] });
  }
});

test('malformed XML, DTDs and external entities fail closed without fetching', () => {
  for (const input of ['<MPD>', '<MPD/><MPD/>', '<MPD a="1" a="2"/>', '<x:MPD/>',
    '<MPD>&undefined;</MPD>', '<!DOCTYPE MPD SYSTEM "https://blocked.example/external"><MPD/>',
    '<!DOCTYPE MPD [<!ENTITY x SYSTEM "file:///etc/passwd">]><MPD>&x;</MPD>',
    '<!DOCTYPE MPD [<!ENTITY x "expanded">]><MPD>&x;</MPD>', '<MPD xmlns="urn:other"/>']) {
    assert.deepEqual(parseDashMpd(input, manifest), { status: 'unsupported', tracks: [] }, input);
  }
});

test('invalid numeric metadata is not fabricated; segments and timelines are not expanded', () => {
  const result = parseDashMpd(wrap('<AdaptationSet mimeType="video/mp4"><Representation id="v" width="NaN" height="-1" bandwidth="Infinity" frameRate="1/0"><SegmentTemplate media="never-fetch-$Number$.m4s"><SegmentTimeline><S d="1" r="999999"/></SegmentTimeline></SegmentTemplate></Representation></AdaptationSet>'), manifest);
  assert.deepEqual([result.tracks[0].width, result.tracks[0].height, result.tracks[0].bandwidth, result.tracks[0].frameRate], [null, null, null, null]);
  assert.equal(result.tracks[0].baseUrl, manifest.url);
});

test('periods and groups do not leak metadata; declared muxed components remain combined', () => {
  const result = parseDashMpd('<MPD><BaseURL>?a=1&amp;a=2</BaseURL><BaseURL>ignored/</BaseURL><Period lang="en"><AdaptationSet id="a" mimeType="audio/mp4"><Representation id="same"/></AdaptationSet></Period><Period><AdaptationSet id="b"><ContentComponent contentType="video"/><ContentComponent contentType="audio"/><Representation id="same"/></AdaptationSet></Period></MPD>', manifest);
  assert.equal(result.status, 'found');
  assert.deepEqual(result.tracks.map(t => [t.id, t.groupId, t.kind, t.language, t.mimeType, t.baseUrl]), [
    ['same', 'a', 'audio', 'en', 'audio/mp4', 'https://cdn.example/input.mpd?a=1&a=2'],
    ['same', 'b', 'combined', null, null, 'https://cdn.example/input.mpd?a=1&a=2'],
  ]);
  const partial = parseDashMpd(wrap('<AdaptationSet mimeType="video/mp4"><Representation id="v"/></AdaptationSet><AdaptationSet><Representation id="unknown"/></AdaptationSet>'), manifest);
  assert.equal(partial.status, 'unsupported');
  assert.deepEqual(partial.tracks.map(t => t.id), ['v']);
});

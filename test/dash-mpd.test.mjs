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
    download: { kind: 'resources', resources: [
      { role: 'initialization', kind: 'url', url: 'https://cdn.example/media/period/video/init.mp4?sig=init%2f' },
      { role: 'media', kind: 'url', url: 'https://cdn.example/media/period/video/two.m4s' },
      { role: 'media', kind: 'url', url: 'https://cdn.example/media/period/video/high.mp4?sig=child%2f+&x=&x=2' },
    ] },
    codec: 'avc1.640028', mimeType: 'video/mp4', bandwidth: 5000000,
    width: 1920, height: 1080, frameRate: 30000 / 1001, language: null, channels: null,
  });
  assert.deepEqual([low.width, low.height, low.frameRate, low.codec, low.bandwidth],
    [640, 360, 24, 'avc1.42001e', 900000]);
  assert.deepEqual([en.kind, en.groupId, en.language, en.channels, en.codec, en.bandwidth],
    ['audio', 'sound', 'en', '2', 'mp4a.40.2', 128000]);
  assert.deepEqual([pl.language, pl.channels, pl.bandwidth], ['pl', '6', null]);
  assert.equal(pl.download.resources[1].url, 'https://cdn.example/audio/audio.m4s');
  assert.equal(result.tracks.length, 4);
  for (const track of result.tracks) assert.equal(track.manifest, manifest);
});

test('unknowns stay null and missing IDs are stable without guessing media kind', () => {
  const input = wrap('<AdaptationSet contentType="audio"><Representation/></AdaptationSet>');
  const result = parseDashMpd(input, manifest);
  const track = result.tracks[0];
  assert.deepEqual(track, { id: 'mpd/0/0/0', groupId: null, kind: 'audio', manifest,
    download: { kind: 'unavailable', reason: 'unsupported' }, codec: null, mimeType: null, bandwidth: null,
    width: null, height: null, frameRate: null, language: null, channels: null });
  assert.deepEqual(parseDashMpd(input, manifest), result);
  assert.equal(parseDashMpd(wrap('<AdaptationSet><Representation id="unknown"/></AdaptationSet>'), manifest).status, 'unsupported');
  assert.deepEqual(parseDashMpd('<MPD/>', manifest), { status: 'unavailable', tracks: [] });
});

test('single ContentComponent supplies audio kind and language with or without audio MIME', () => {
  for (const mime of ['', ' mimeType="audio/mp4"']) {
    const result = parseDashMpd(wrap(`<AdaptationSet${mime}>
      <ContentComponent contentType="audio" lang="en"/>
      <Representation id="component-audio" codecs="mp4a.40.2"/>
    </AdaptationSet>`), manifest);
    assert.equal(result.status, 'found');
    assert.deepEqual(result.tracks.map(t => [t.id, t.kind, t.language]),
      [['component-audio', 'audio', 'en']]);
  }
});

test('nearer explicit attributes override component defaults and inherited metadata', () => {
  const result = parseDashMpd(`<MPD><Period contentType="video" lang="de">
    <AdaptationSet contentType="video" lang="pl">
      <ContentComponent contentType="audio" lang="en"/>
      <Representation id="adaptation"/>
      <Representation id="representation" contentType="audio" lang="fr"/>
    </AdaptationSet>
    <AdaptationSet>
      <ContentComponent contentType="audio" lang="en"/>
      <Representation id="mime" mimeType="video/mp4" xml:lang="es"/>
    </AdaptationSet>
  </Period></MPD>`, manifest);
  assert.equal(result.status, 'found');
  assert.deepEqual(result.tracks.map(t => [t.id, t.kind, t.language]), [
    ['adaptation', 'video', 'pl'], ['representation', 'audio', 'fr'], ['mime', 'video', 'es'],
  ]);
});

test('conflicting component languages stay unknown instead of choosing one', () => {
  const result = parseDashMpd(wrap(`<AdaptationSet>
    <ContentComponent contentType="audio" lang="en"/>
    <ContentComponent contentType="audio" lang="pl"/>
    <Representation id="ambiguous"/>
  </AdaptationSet>`), manifest);
  assert.equal(result.status, 'found');
  assert.deepEqual(result.tracks.map(t => [t.kind, t.language]), [['audio', null]]);
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
  assert.deepEqual(result.tracks[0].download, { kind: 'unavailable', reason: 'unsupported' });
});

test('only explicit complete SegmentList resources are usable; unsafe and ranged forms stay unavailable', () => {
  for (const [body, reason] of [
    ['<BaseURL>directory/</BaseURL>', 'unsupported'],
    ['<BaseURL>movie.mp4</BaseURL>', 'unsupported'],
    ['<SegmentBase indexRange="1-20"/>', 'unsupported'],
    ['<SegmentList><SegmentURL media="one.m4s"/></SegmentList>', 'missing-initialization'],
    ['<SegmentList><Initialization sourceURL="init.mp4"/><SegmentURL/></SegmentList>', 'unknown'],
    ['<SegmentList><Initialization sourceURL="init.mp4" range="0-9"/><SegmentURL media="one.m4s"/></SegmentList>', 'unsupported'],
    ['<SegmentList><Initialization sourceURL="init.mp4"/><SegmentURL media="http://unsafe.invalid/one"/></SegmentList>', 'unsafe'],
    ['<BaseURL>https://user:pass@unsafe.invalid/</BaseURL><SegmentList><Initialization sourceURL="init.mp4"/><SegmentURL media="one.m4s"/></SegmentList>', 'unsafe'],
  ]) {
    const result = parseDashMpd(wrap(`<AdaptationSet contentType="video"><Representation id="v">${body}</Representation></AdaptationSet>`), manifest);
    assert.equal(result.status, 'found');
    assert.deepEqual(result.tracks[0].download, { kind: 'unavailable', reason });
  }
  const overridden = parseDashMpd(wrap(`<AdaptationSet contentType="video">
    <SegmentList><Initialization sourceURL="init.mp4"/><SegmentURL media="one.m4s"/></SegmentList>
    <Representation id="v"><SegmentTemplate media="$Number$.m4s"/></Representation>
  </AdaptationSet>`), manifest);
  assert.equal(overridden.tracks[0].download.reason, 'unsupported');
});

test('periods and groups do not leak metadata; declared muxed components remain combined', () => {
  const result = parseDashMpd('<MPD><BaseURL>?a=1&amp;a=2</BaseURL><BaseURL>ignored/</BaseURL><Period lang="en"><AdaptationSet id="a" mimeType="audio/mp4"><Representation id="same"/></AdaptationSet></Period><Period><AdaptationSet id="b"><ContentComponent contentType="video"/><ContentComponent contentType="audio"/><Representation id="same"/></AdaptationSet></Period></MPD>', manifest);
  assert.equal(result.status, 'found');
  assert.deepEqual(result.tracks.map(t => [t.id, t.groupId, t.kind, t.language, t.mimeType]), [
    ['same', 'a', 'audio', 'en', 'audio/mp4'], ['same', 'b', 'combined', null, null],
  ]);
  assert.ok(result.tracks.every(t => t.download.reason === 'unsupported'));
  const partial = parseDashMpd(wrap('<AdaptationSet mimeType="video/mp4"><Representation id="v"/></AdaptationSet><AdaptationSet><Representation id="unknown"/></AdaptationSet>'), manifest);
  assert.equal(partial.status, 'unsupported');
  assert.deepEqual(partial.tracks.map(t => t.id), ['v']);
});

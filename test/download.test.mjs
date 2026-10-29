import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHls } from '../src/detect/hls.ts';
import { selection } from '../src/download/select.ts';
import { assemble, mediaPlaylist, limits } from '../src/download/assemble.ts';
import { validateInitialization } from '../src/download/initialization.ts';
import { Buffer } from 'node:buffer';
import { NativeSaveError } from '../src/download/native-error.ts';

const { Response, ReadableStream, Blob, AbortController } = globalThis;
const manifest = { protocol: 'hls', cdn: 'owned', url: 'https://owned.vimeocdn.com/master.m3u8' };
const master = '#EXTM3U\n' + [
  '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="other",NAME="Other",DEFAULT=YES,URI="other.m3u8"',
  '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="sound",NAME="High",URI="high.m3u8"',
  '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="sound",NAME="Default",DEFAULT=YES,URI="default.m3u8"',
  '#EXT-X-STREAM-INF:BANDWIDTH=1000,CODECS="avc1.42c00a,mp4a.40.2",AUDIO="sound"',
  'video.m3u8',
].join('\n');

test('selection stays candidate/group-bound, prefers declared default then bitrate, and rejects unsupported pairs', () => {
  const parsed = parseHls(master, manifest);
  const candidate = { ...parsed, manifest };
  const selected = selection(candidate, 'variant:0');
  assert.deepEqual(selected.map(track => track.id), ['variant:0', 'audio:2']);
  const noDefault = { ...candidate, tracks: candidate.tracks.map(track => ({ ...track, attributes: {}, bandwidth: track.id === 'audio:1' ? 256000 : 128000 })) };
  assert.equal(selection(noDefault, 'variant:0')[1].id, 'audio:1');
  const foreign = { ...candidate.tracks[2], manifest: { ...manifest, cdn: 'foreign' } };
  assert.equal(selection({ ...candidate, tracks: [candidate.tracks[0], foreign] }, 'variant:0').length, 0);
  assert.equal(selection({ ...candidate, status: 'protected' }, 'variant:0').length, 0);
  assert.equal(selection({ ...candidate, tracks: candidate.tracks.filter(track => track.kind === 'video') }, 'variant:0').length, 0);
  assert.equal(selection({ ...candidate, tracks: candidate.tracks.map(track => ({ ...track, kind: 'combined' })) }, 'variant:0').length, 0);
  assert.equal(selection({ ...candidate, tracks: candidate.tracks.map(track => ({ ...track, mimeType: `${track.kind}/webm` })) }, 'variant:0').length, 0);
  assert.deepEqual(selection(candidate, 'audio:2').map(track => track.kind), ['audio']);
});

test('finite HLS assembly preserves exact query resolution and rejects encrypted, ranged, live or excessive plans', () => {
  const plain = '#EXTM3U\n#EXT-X-MAP:URI="init.mp4?init=1"\n#EXTINF:1,\nfirst.m4s\n#EXTINF:1,\n?media=2\n#EXT-X-ENDLIST';
  assert.deepEqual(mediaPlaylist(plain, manifest.url), [
    { role: 'initialization', kind: 'url', url: 'https://owned.vimeocdn.com/init.mp4?init=1' },
    { role: 'media', kind: 'url', url: 'https://owned.vimeocdn.com/first.m4s' },
    { role: 'media', kind: 'url', url: 'https://owned.vimeocdn.com/master.m3u8?media=2' },
  ]);
  for (const directive of ['#EXT-X-KEY:METHOD=AES-128,URI="key"', '#EXT-X-BYTERANGE:1@0', '#EXT-X-DISCONTINUITY', '#EXT-X-SESSION-KEY:METHOD=SAMPLE-AES,URI="license"']) {
    assert.throws(() => mediaPlaylist(plain.replace('#EXTINF:1,', directive + '\n#EXTINF:1,'), manifest.url));
  }
  assert.throws(() => mediaPlaylist(plain.replace('#EXT-X-ENDLIST', ''), manifest.url), /live/);
  assert.throws(() => mediaPlaylist(plain.replace('#EXT-X-ENDLIST', '#EXTINF:1,\n#EXT-X-ENDLIST'), manifest.url), /Invalid/);
  assert.throws(() => mediaPlaylist('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n' + '#EXTINF:1,\nx.m4s\n'.repeat(limits.resources) + '#EXT-X-ENDLIST', manifest.url), /resources/);
});

test('initialization rejects combined, protected, mismatched and truncated MP4 before native saving', () => {
  const box = (type, payload = Buffer.alloc(0)) => {
    const header = Buffer.alloc(8); header.writeUInt32BE(8 + payload.length); header.write(type, 4);
    return Buffer.concat([header, payload]);
  };
  const handler = Buffer.alloc(12); handler.write('vide', 8);
  const entries = Buffer.alloc(8); entries.writeUInt32BE(1, 4);
  const track = box('trak', box('mdia', Buffer.concat([box('hdlr', handler),
    box('minf', box('stbl', box('stsd', Buffer.concat([entries, box('avc1')]))))])));
  const clear = box('moov', track);
  validateInitialization(clear, 'video');
  assert.throws(() => validateInitialization(clear, 'audio'), /handler/);
  assert.throws(() => validateInitialization(box('moov', Buffer.concat([track, track])), 'video'), /separate-track/);
  assert.throws(() => validateInitialization(box('moov', Buffer.concat([track, box('pssh')])), 'video'), /Protected/);
  const encrypted = Buffer.from(clear); encrypted.write('encv', encrypted.indexOf('avc1'));
  assert.throws(() => validateInitialization(encrypted, 'video'), /Protected/);
  assert.throws(() => validateInitialization(clear.subarray(0, clear.length - 1), 'video'), /size/);
});

test('assembly accepts a read above 1 MiB and refuses oversized segments without retrying', async t => {
  const box = (type, payload = Buffer.alloc(0)) => {
    const header = Buffer.alloc(8); header.writeUInt32BE(8 + payload.length); header.write(type, 4);
    return Buffer.concat([header, payload]);
  };
  const handler = Buffer.alloc(12); handler.write('vide', 8);
  const entries = Buffer.alloc(8); entries.writeUInt32BE(1, 4);
  const stsd = box('stsd', Buffer.concat([entries, box('avc1')]));
  const mdia = box('mdia', Buffer.concat([box('hdlr', handler), box('minf', box('stbl', stsd))]));
  const init = box('moov', box('trak', mdia));
  const url = 'https://owned.vimeocdn.com/segment';
  const track = { kind: 'video', download: { kind: 'resources', resources: [
    { role: 'initialization', kind: 'inline-base64', data: init.toString('base64') },
    { role: 'media', kind: 'url', url },
  ] } };
  const chunk = new Uint8Array(2 * 1024 ** 2).fill(37);
  let count = 1;
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    let remaining = count;
    const response = new Response(new ReadableStream({
      pull(controller) { if (remaining-- > 0) controller.enqueue(chunk); else controller.close(); },
    }));
    Object.defineProperty(response, 'url', { value: url });
    return response;
  });
  const files = new Map();
  const directory = {
    async getFileHandle(name) {
      return {
        async createWritable() {
          const parts = [];
          return { async write(value) { parts.push(value); }, async close() { files.set(name, new Blob(parts)); }, async abort() {} };
        },
        async getFile() { return files.get(name); },
      };
    },
    async removeEntry(name) { files.delete(name); },
  };
  const output = [];
  const writer = { async write(value) { output.push(value); } };
  await assemble(track, writer, async () => {}, new AbortController().signal, () => {}, directory);
  assert.deepEqual(Buffer.concat(output), Buffer.concat([init, chunk]));
  assert.equal(files.size, 0);
  count = 33; requests = 0;
  await assert.rejects(assemble(track, writer, async () => {}, new AbortController().signal, () => {}, directory), /Media size limit/);
  assert.equal(requests, 1, 'size failures must not retry');
  assert.equal(files.size, 0);
});

test('native failure boundary separates disk exhaustion, filesystem failure and cancellation without leaking locators', () => {
  // Synthetic FILE_NO_SPACE classification, not a filled disk or a mocked Chrome API.
  assert.equal(new NativeSaveError('FILE_NO_SPACE').category, 'disk-full');
  assert.equal(new NativeSaveError('FILE_ACCESS_DENIED').category, 'filesystem');
  assert.equal(new NativeSaveError('USER_CANCELED').category, 'cancelled');
  const signed = 'https://owned.vimeocdn.com/a?signature=private';
  const failure = new NativeSaveError(signed);
  assert.equal(failure.category, 'filesystem');
  assert.equal(failure.message.includes(signed), false);
  assert.equal(failure.message.includes('signature'), false);
});

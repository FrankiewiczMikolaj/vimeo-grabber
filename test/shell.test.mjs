import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { filenameStem, trackFilename } from '../src/download/filename.ts';
import { mergeCommand } from '../src/shell/linux.ts';

test('title names retain role and format within Linux component limits', () => {
  for (const title of ['', ' ../\\\n\0:*?"<>| ', '界'.repeat(300), 'x'.repeat(500)]) {
    const stem = filenameStem(title, '91');
    for (const [kind, suffix] of [['video', ' [720p].video.mp4'], ['audio', '.audio.m4a']]) {
      const name = trackFilename(stem, kind, 720);
      assert.ok(name.endsWith(suffix));
      assert.ok(Buffer.byteLength(name) <= 120);
      assert.ok(!/[\p{Cc}\\/]/u.test(name));
      assert.ok(!name.startsWith('.'));
    }
  }
  assert.equal(filenameStem(null, '91'), 'vimeo-91');
  assert.equal(filenameStem(' / . ', '91'), 'vimeo-91');
});

test('POSIX parsing preserves each native path as one literal argument', () => {
  const video = "/tmp/it's $(false); `false` [720p].video (1).mp4";
  const audio = '/tmp/sound & track (2).m4a';
  const command = mergeCommand(video, audio, 'safe.merged.mp4');
  const script = `ffmpeg() { printf '%s\\0' "$@"; }; ${command}`;
  const args = execFileSync('bash', ['-c', script]).toString().split('\0');
  assert.deepEqual(args, ['-n', '-i', video, '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '/tmp/safe.merged.mp4', '']);
  assert.throws(() => mergeCommand('relative.mp4', audio, 'out.mp4'));
  assert.throws(() => mergeCommand(video, audio, '../out.mp4'));
});

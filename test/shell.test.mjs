import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { filenameStem, trackFilename } from '../src/download/filename.ts';
import { mergeCommand } from '../src/shell/linux.ts';

test('title names preserve role-like text, sanitize safely and bound UTF-8 stems', () => {
  for (const [title, expected] of [
    ['A video 1080p (1)', 'A video 1080p (1)'],
    [' ../\\\n\0:*?"<>| ', 'vimeo-91'],
    [null, 'vimeo-91'], ['', 'vimeo-91'],
    ['界'.repeat(300), '界'.repeat(32)], ['x'.repeat(500), 'x'.repeat(96)],
    [' cafe\u0301 / clip ', 'café clip'],
  ]) {
    const stem = filenameStem(title, '91');
    assert.equal(stem, expected);
    assert.ok(Buffer.byteLength(stem) <= 96);
    assert.equal(trackFilename(stem, 'video', 1080), `${expected} - video 1080p.mp4`);
    assert.equal(trackFilename(stem, 'audio', null), `${expected} - audio.m4a`);
  }
});

test('POSIX parsing preserves each native path as one literal argument', () => {
  const stem = filenameStem("it's $(false); `false` - video 1080p (1)", '91');
  const video = `/tmp/${stem} - video 1080p (2).mp4`;
  const audio = `/tmp/${stem} - audio (3).m4a`;
  const command = mergeCommand(video, audio, `${stem}.mp4`);
  const script = `ffmpeg() { printf '%s\\0' "$@"; }; ${command}`;
  const args = execFileSync('bash', ['-c', script]).toString().split('\0');
  assert.deepEqual(args, ['-n', '-i', video, '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', `/tmp/${stem}.mp4`, '']);
  assert.throws(() => mergeCommand('relative.mp4', audio, 'out.mp4'));
  assert.throws(() => mergeCommand(video, audio, '../out.mp4'));
});

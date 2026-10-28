import type { Track } from '../detect/model';

/** Only single-track, clear ISO-BMFF initialization is supported, never a combined file. */
export function validateInitialization(bytes: Uint8Array, kind: Track['kind']) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  let tracks = 0;
  let handlers = 0;
  let descriptions = 0;
  let movie = false;
  function boxes(start: number, end: number, depth: number) {
    if (depth > 8) throw new Error('Unsupported initialization depth');
    while (start < end) {
      if (end - start < 8) throw new Error('Invalid initialization box');
      const size = view.getUint32(start);
      const type = text(start + 4);
      if (size < 8 || start + size > end) throw new Error('Unsupported initialization box size');
      if (['pssh', 'sinf', 'tenc', 'encv', 'enca'].includes(type)) throw new Error('Protected initialization');
      if (type === 'moov') movie = true;
      if (type === 'trak') tracks++;
      if (type === 'hdlr') {
        if (size < 20 || text(start + 16) !== (kind === 'video' ? 'vide' : 'soun')) throw new Error('Unsupported track handler');
        handlers++;
      }
      if (type === 'stsd') {
        if (size < 24 || view.getUint32(start + 12) !== 1) throw new Error('Unsupported sample descriptions');
        const entry = text(start + 20);
        if (!(kind === 'video' ? ['avc1', 'avc3', 'hvc1', 'hev1', 'av01'] : ['mp4a', 'ac-3', 'ec-3']).includes(entry)) {
          throw new Error('Protected or unsupported sample codec');
        }
        descriptions++;
      }
      if (['moov', 'trak', 'mdia', 'minf', 'stbl', 'mvex'].includes(type)) boxes(start + 8, start + size, depth + 1);
      start += size;
    }
  }
  boxes(0, bytes.length, 0);
  if (!movie || tracks !== 1 || handlers !== 1 || descriptions !== 1) throw new Error('Unsupported separate-track initialization');
}

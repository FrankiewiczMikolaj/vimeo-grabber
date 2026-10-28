// Leave room for quality, role, extension and native uniqueness suffixes (also on UTF-8 filesystems).
export function filenameStem(title: string | null, videoId: string): string {
  const clean = (title ?? '').normalize('NFC').replace(/[\p{Cc}\p{Cf}/\\:*?"<>|]/gu, ' ')
    .replace(/\s+/gu, ' ').replace(/^[.\s]+|[.\s]+$/gu, '');
  let stem = '';
  const encoder = new TextEncoder();
  let bytes = 0;
  for (const character of clean) {
    bytes += encoder.encode(character).length;
    if (bytes > 96) break;
    stem += character;
  }
  return stem.trimEnd() || `vimeo-${videoId}`;
}

export function trackFilename(stem: string, kind: string, height: number | null): string {
  return kind === 'audio' ? `${stem}.audio.m4a` : `${stem} [${height ? `${height}p` : 'video'}].video.mp4`;
}

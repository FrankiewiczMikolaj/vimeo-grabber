import { readFile } from 'node:fs/promises';

const tracks = JSON.parse(await readFile(new URL('./dash-json.json', import.meta.url), 'utf8'));
export const avcConfig = JSON.parse(await readFile(new URL('./dash-avc-config.json', import.meta.url), 'utf8'));

// Owned metadata only. Inline init exists only when the server option is requested.
export function dashAvcResponse(address) {
  const url = new URL(address);
  return {
    drm: { enabled: false, widevine: {}, playready: null },
    content_protection: [{ scheme: '', encrypted: false }],
    ...Object.fromEntries(['video', 'audio'].map(kind => [kind, tracks[kind].map(track => ({
      ...track, drm: { enabled: false },
      ...(kind === 'video' && url.pathname.endsWith('/generic.json') ? { codecs: 'av01.0.08M.08' } : {}),
      init_segment: url.searchParams.get('base64_init') === '1'
        ? 'AAAAHGZ0eXBpc29tAAACAGlzb21pc28yYXZjMQ==' : undefined,
    }))])),
  };
}

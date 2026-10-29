import type { DetectionSource, ManifestReference, NormalisedVideo, Protocol, Track } from './model';
import { hasProtection } from './protection.ts';
import { progressiveUrl } from './progressive.ts';

type Fields = Record<string, unknown>;
const fields = (value: unknown): Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Fields : {};

function identity(value: unknown): string | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) ? value : null;
}

function manifestUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() !== value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Metadata only: no discovery, fetching, manifest parsing, or access decisions. */
export function normalisePlayerConfig(config: unknown, source: DetectionSource): NormalisedVideo | null {
  const root = fields(config);
  const video = fields(root.video);
  const id = identity(video.id);
  if (id === null) return null;
  const request = fields(root.request);
  const files = fields(request.files);
  const manifests: ManifestReference[] = [];
  for (const protocol of ['dash', 'hls'] as const satisfies readonly Protocol[]) {
    const descriptor = fields(files[protocol]);
    const cdns = fields(descriptor.cdns);
    const preferred = descriptor.default_cdn;
    const names = Object.keys(cdns);
    if (typeof preferred === 'string' && Object.hasOwn(cdns, preferred)) {
      names.splice(names.indexOf(preferred), 1);
      names.unshift(preferred);
    }
    for (const cdn of names) {
      const entry = fields(cdns[cdn]);
      for (const key of protocol === 'dash' ? ['avc_url', 'url'] : ['url']) {
        const url = entry[key];
        if (manifestUrl(url) && !manifests.some(item =>
          item.protocol === protocol && item.cdn === cdn && item.url === url)) {
          // A capability elsewhere in request.drm/hls_cenc is not evidence for this URL.
          const scopedDrm = protocol === 'hls' && (
            hasProtection({ drm: fields(request.drm).hls }) ||
            (Object.values(fields(fields(files.hls_cenc).cdns)).some(value =>
              fields(value).url === url) && hasProtection(request)));
          manifests.push({ protocol, cdn, url,
            ...(hasProtection(descriptor) || hasProtection(entry) || scopedDrm ? { protected: true as const } : {}) });
        }
      }
    }
  }
  const tracks: Track[] = [];
  for (const value of Array.isArray(files.progressive) ? files.progressive : []) {
    const entry = fields(value);
    if (!manifestUrl(entry.url) || entry.mime !== 'video/mp4' ||
      tracks.some(track => track.manifest.url === entry.url)) continue;
    const positive = (value: unknown) => typeof value === 'number' &&
      Number.isFinite(value) && value > 0 ? value : null;
    const size = Number.isSafeInteger(entry.size) && Number(entry.size) > 0 ? Number(entry.size) : null;
    const reference = { protocol: 'progressive' as const, url: entry.url,
      ...(hasProtection(entry) || hasProtection({ drm: fields(request.drm).progressive }) ?
        { protected: true as const } : {}) };
    tracks.push({
      id: `progressive-${tracks.length}`, groupId: null, kind: 'combined', manifest: reference,
      download: reference.protected ? { kind: 'unavailable', reason: 'protected' } :
        !progressiveUrl(entry.url) ? { kind: 'unavailable', reason: 'unsafe' } :
          { kind: 'file', url: entry.url, size },
      codec: null, mimeType: 'video/mp4', bandwidth: null,
      width: positive(entry.width), height: positive(entry.height), frameRate: positive(entry.fps),
      language: null, channels: null,
    });
  }
  return {
    id, title: typeof video.title === 'string' && video.title.trim() ? video.title : null,
    source: { ...source }, status: hasProtection(root) || hasProtection(video) ? 'protected' :
      manifests.length || tracks.length ? 'found' : 'unavailable', manifests, tracks,
  };
}

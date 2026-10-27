import type { DetectionSource, ManifestReference, NormalisedVideo, Protocol } from './model';

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
  const files = fields(fields(root.request).files);
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
      for (const key of protocol === 'dash' ? ['url', 'avc_url'] : ['url']) {
        const url = entry[key];
        if (manifestUrl(url) && !manifests.some(item =>
          item.protocol === protocol && item.cdn === cdn && item.url === url)) {
          manifests.push({ protocol, cdn, url });
        }
      }
    }
  }
  return {
    id, title: typeof video.title === 'string' && video.title.trim() ? video.title : null,
    source: { ...source }, status: manifests.length ? 'found' : 'unavailable', manifests, tracks: [],
  };
}

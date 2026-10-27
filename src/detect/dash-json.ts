import type { DetectionStatus, DownloadReference, DownloadResource, ManifestReference, Track } from './model';
import { hasProtection } from './protection.ts';

type Fields = Record<string, unknown>;
const fields = (value: unknown): Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Fields : {};
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;
const positive = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
const integer = (value: unknown): number | null =>
  positive(value) !== null && Number.isSafeInteger(value) ? value as number : null;

function resolve(value: unknown, base?: string): string | null {
  if (typeof value !== 'string' || /\s|\\/.test(value)) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash ? url.href : null;
  } catch {
    return null;
  }
}

export interface DashJsonResult {
  readonly status: DetectionStatus;
  readonly tracks: readonly Track[];
}

function download(entry: Fields, base: string | null, protectedTrack: boolean): DownloadReference {
  const unavailable = (reason: Extract<DownloadReference, { kind: 'unavailable' }>['reason']): DownloadReference =>
    ({ kind: 'unavailable', reason });
  if (protectedTrack) return unavailable('protected');
  if (base === null) return unavailable('unsafe');
  const init = text(entry.init_segment);
  if (init === null) return unavailable('missing-initialization');
  const resources: DownloadResource[] = [];
  // Keep canonical inline data distinct from explicit URL-form initialization.
  if (init.length <= 87_384 &&
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(init)) {
    const decoded = atob(init);
    if (decoded.length > 65_536) return unavailable('unsupported');
    if (btoa(decoded) !== init) return unavailable('unsafe');
    resources.push({ role: 'initialization', kind: 'inline-base64', data: init });
  } else {
    const url = /^(?:https:\/\/|\/|\.\.?\/)|[.?]/.test(init) ? resolve(init, base) : null;
    if (url === null) return unavailable('unsafe');
    resources.push({ role: 'initialization', kind: 'url', url });
  }
  if (!Array.isArray(entry.segments) || !entry.segments.length) return unavailable('unknown');
  for (const segment of entry.segments) {
    const url = resolve(fields(segment).url, base);
    if (url === null) return unavailable('unsafe');
    resources.push({ role: 'media', kind: 'url', url });
  }
  return { kind: 'resources', resources };
}

/** Decoded metadata only. URL validation is not fetch authorization. */
export function parseDashJson(
  input: unknown, manifest: ManifestReference, responseUrl: string = manifest.url,
): DashJsonResult {
  const root = fields(input);
  const response = resolve(responseUrl);
  if (manifest.protocol !== 'dash' || response === null) return { status: 'unsupported', tracks: [] };
  const rootBase = root.base_url === undefined ? response : resolve(root.base_url, response);
  const rootProtected = hasProtection(root);
  let protectedData = rootProtected;
  const tracks: Track[] = [];
  const supported = Array.isArray(root.video) || Array.isArray(root.audio);
  for (const kind of ['video', 'audio'] as const) {
    const entries = root[kind];
    if (!Array.isArray(entries)) continue;
    for (const value of entries) {
      const entry = fields(value);
      const protectedTrack = rootProtected || hasProtection(entry);
      protectedData ||= protectedTrack;
      const id = text(entry.id) ?? (integer(entry.id) !== null ? String(entry.id) : null);
      if (id === null) continue;
      const channels = text(entry.channels) ?? (integer(entry.channels) !== null ? String(entry.channels) : null);
      const base = entry.base_url === undefined ? rootBase :
        rootBase === null ? null : resolve(entry.base_url, rootBase);
      tracks.push({
        id, groupId: null, kind, manifest: { ...manifest },
        download: download(entry, base, protectedTrack),
        codec: text(entry.codecs), mimeType: text(entry.mime_type),
        bandwidth: positive(entry.bitrate), width: kind === 'video' ? integer(entry.width) : null,
        height: kind === 'video' ? integer(entry.height) : null,
        frameRate: kind === 'video' ? positive(entry.framerate) : null,
        language: kind === 'audio' ? text(entry.lang) : null,
        channels: kind === 'audio' ? channels : null,
      });
    }
  }
  return { status: protectedData ? 'protected' : tracks.length ? 'found' : supported ? 'unavailable' : 'unsupported', tracks };
}

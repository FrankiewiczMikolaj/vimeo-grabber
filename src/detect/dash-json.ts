import type { DetectionStatus, ManifestReference, Track } from './model';
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
  if (typeof value !== 'string' || value.trim() !== value) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export interface DashJsonTrack extends Track {
  readonly baseUrl: string | null;
  readonly protected: boolean;
}

export interface DashJsonResult {
  readonly status: DetectionStatus;
  readonly tracks: readonly DashJsonTrack[];
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
  const tracks: DashJsonTrack[] = [];
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
      tracks.push({
        id, groupId: null, kind, manifest: { ...manifest },
        codec: text(entry.codecs), mimeType: text(entry.mime_type),
        bandwidth: positive(entry.bitrate), width: kind === 'video' ? integer(entry.width) : null,
        height: kind === 'video' ? integer(entry.height) : null,
        frameRate: kind === 'video' ? positive(entry.framerate) : null,
        language: kind === 'audio' ? text(entry.lang) : null,
        channels: kind === 'audio' ? channels : null,
        baseUrl: entry.base_url === undefined ? rootBase :
          (rootBase === null ? resolve(entry.base_url) : resolve(entry.base_url, rootBase)),
        protected: protectedTrack,
      });
    }
  }
  return { status: protectedData ? 'protected' : tracks.length ? 'found' : supported ? 'unavailable' : 'unsupported', tracks };
}

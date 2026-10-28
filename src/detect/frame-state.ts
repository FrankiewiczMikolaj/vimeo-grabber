import type { PageDiscovery } from './discover';
import type { PlaybackCandidate } from './model';

export type FrameCandidate = PlaybackCandidate & { readonly frameId: number; readonly documentId: string };
export type FrameResolver = (discovery: PageDiscovery, authoritativeFrameUrl: string) =>
  Promise<readonly PlaybackCandidate[]>;
export interface FramePublication {
  readonly tabId: number;
  readonly frameId: number;
  readonly documentId: string;
  readonly status: 'pending' | 'ready' | 'error';
  readonly results: readonly PlaybackCandidate[];
}
const origins = ['https://vimeo.com', 'https://www.vimeo.com', 'https://player.vimeo.com'];
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length <= 8192;
const nullableText = (v: unknown) => v === null || text(v);
const number = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
const keys = (v: Record<string, unknown>, names: string[]) =>
  Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
function url(v: unknown): URL | null {
  if (!text(v)) return null;
  try {
    const u = new URL(v);
    return v === v.trim() && !v.includes('\\') && u.protocol === 'https:'
      && !u.username && !u.password && !u.port && !u.hash ? u : null;
  } catch { return null; }
}
function config(v: unknown): boolean {
  const u = url(v);
  return !!u && u.origin === 'https://player.vimeo.com' && /^\/video\/[1-9]\d*\/config$/.test(u.pathname);
}
function manifest(v: unknown, alternative = false): boolean {
  if (!record(v) || !keys(v, v.protected === true ? ['protocol', 'cdn', 'url', 'protected'] :
    ['protocol', 'cdn', 'url'])) return false;
  const u = url(v.url);
  return (v.protocol === 'dash' || v.protocol === 'hls') && text(v.cdn)
    && !!u && (alternative || u.hostname === 'vimeocdn.com' || u.hostname.endsWith('.vimeocdn.com'));
}
function download(v: unknown): boolean {
  if (!record(v)) return false;
  if (v.kind === 'playlist') return keys(v, ['kind', 'url']) && !!url(v.url);
  if (v.kind === 'unavailable') return keys(v, ['kind', 'reason']) &&
    ['protected', 'missing-initialization', 'unknown', 'unsafe', 'unsupported'].includes(String(v.reason));
  return v.kind === 'resources' && keys(v, ['kind', 'resources']) && Array.isArray(v.resources) &&
    v.resources.length >= 2 && v.resources.every((r, index) => record(r) &&
      r.role === (index === 0 ? 'initialization' : 'media') &&
      (r.kind === 'url' ? keys(r, ['role', 'kind', 'url']) && !!url(r.url) :
        index === 0 && r.kind === 'inline-base64' && keys(r, ['role', 'kind', 'data']) &&
        typeof r.data === 'string' && r.data.length > 0 && r.data.length <= 87_384 &&
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(r.data)));
}
function video(v: unknown, frameUrl: string): boolean {
  return record(v) && keys(v, ['id', 'title', 'source', 'status', 'manifests', 'tracks'])
    && text(v.id) && /^[1-9]\d*$/.test(v.id) && nullableText(v.title)
    && record(v.source) && keys(v.source, ['frameUrl', 'configUrl'])
    && v.source.frameUrl === frameUrl && (v.source.configUrl === null || config(v.source.configUrl))
    && typeof v.status === 'string'
    && ['pending', 'found', 'unavailable', 'permission-needed', 'denied', 'protected', 'unsupported'].includes(v.status)
    && Array.isArray(v.manifests) && v.manifests.length <= 32 && v.manifests.every(m => manifest(m, true))
    && Array.isArray(v.tracks) && v.tracks.length <= 256 && v.tracks.every(t => record(t)
      && keys(t, ['id', 'groupId', 'kind', 'manifest', 'download', 'codec', 'mimeType', 'bandwidth', 'width', 'height', 'frameRate', 'language', 'channels'])
      && text(t.id) && nullableText(t.groupId) && typeof t.kind === 'string' && ['video', 'audio', 'combined'].includes(t.kind)
      && download(t.download)
      && manifest(t.manifest) && ['codec', 'mimeType', 'language', 'channels'].every(k => nullableText(t[k]))
      && ['bandwidth', 'width', 'height', 'frameRate'].every(k => number(t[k])));
}

// Cap work before walking the schema or cloning; even malformed trees are bounded.
function bounded(value: unknown): boolean {
  let remaining = 262144;
  let nodes = 20000;
  const visit = (v: unknown, depth: number): boolean => {
    if (--nodes < 0 || depth > 12) return false;
    remaining -= typeof v === 'string' ? v.length : 8;
    if (remaining < 0) return false;
    if (v === null || typeof v !== 'object') return true;
    for (const key in v) {
      if (!Object.hasOwn(v, key)) continue;
      remaining -= key.length;
      if (remaining < 0 || !visit((v as Record<string, unknown>)[key], depth + 1)) return false;
    }
    return true;
  };
  return visit(value, 0);
}

/** Chrome supplies sender; never pass a sender object taken from the message. */
export function validateFrameDiscovery(message: unknown, sender: chrome.runtime.MessageSender, extensionId: string): PageDiscovery | null {
  const u = url(sender.url);
  if (!extensionId || sender.id !== extensionId || !Number.isSafeInteger(sender.tab?.id)
    || sender.tab!.id! < 0 || !Number.isSafeInteger(sender.frameId) || sender.frameId! < 0
    || !text(sender.documentId) || !sender.documentId || sender.documentLifecycle !== 'active'
    || !u || !origins.includes(u.origin) || sender.origin !== u.origin) return null;
  if (!bounded(message) || !record(message) || !keys(message, ['type', 'discovery']) || message.type !== 'frame-discovery'
    || !record(message.discovery) || !keys(message.discovery, ['videos', 'configUrls'])) return null;
  const d = message.discovery;
  if (!Array.isArray(d.videos) || d.videos.length > 32 || !Array.isArray(d.configUrls)
    || d.configUrls.length > 64) return null;
  // Bound traversal before stringification. Chrome messages are JSON data, not page objects.
  if (!d.configUrls.every(config) || !d.videos.every(v => video(v, sender.url!))) return null;
  if (JSON.stringify(d).length > 262144) return null;
  return structuredClone(d) as unknown as PageDiscovery;
}

/** In-memory only. Runtime owns authoritative document activation and invalidation. */
export function createFrameState(extensionId: string, resolve: FrameResolver) {
  const tabs = new Map<number, Map<number, FramePublication>>();
  return {
    activate(tabId: number, frameId: number, documentId: string) {
      let frames = tabs.get(tabId);
      if (!frames) tabs.set(tabId, frames = new Map());
      // Activation is a new lifetime even when IDs match (e.g. reconnect after clearing).
      frames.set(frameId, { tabId, frameId, documentId, status: 'ready', results: [] });
    },
    remove(tabId: number, frameId: number, documentId: string) {
      const frames = tabs.get(tabId);
      if (frames?.get(frameId)?.documentId === documentId) frames.delete(frameId);
      if (!frames?.size) tabs.delete(tabId);
    },
    clearTab(tabId: number) { tabs.delete(tabId); },
    clear() { tabs.clear(); },
    frames(tabId: number): readonly FramePublication[] {
      return structuredClone([...(tabs.get(tabId)?.values() ?? [])]);
    },
    candidates(tabId: number): readonly FrameCandidate[] {
      // Keep each live document's alternatives, even for the same video or frame URL.
      return structuredClone([...(tabs.get(tabId)?.values() ?? [])]
        .sort((a, b) => a.frameId - b.frameId)
        .flatMap(frame => frame.results.map(candidate => ({
          ...candidate, frameId: frame.frameId, documentId: frame.documentId,
          id: JSON.stringify([frame.frameId, frame.documentId, candidate.id]),
        }))));
    },
    async publish(message: unknown, sender: chrome.runtime.MessageSender): Promise<boolean> {
      const discovery = validateFrameDiscovery(message, sender, extensionId);
      if (!discovery) return false;
      const tabId = sender.tab!.id!;
      const frameId = sender.frameId!;
      const frames = tabs.get(tabId);
      if (!frames || frames.get(frameId)?.documentId !== sender.documentId) return false;
      const pending: FramePublication = { tabId, frameId, documentId: sender.documentId!, status: 'pending', results: [] };
      frames.set(frameId, pending);
      try {
        const results = await resolve(discovery, sender.url!);
        if (tabs.get(tabId)?.get(frameId) === pending) {
          frames.set(frameId, { ...pending, status: 'ready', results: structuredClone(results) });
        }
      } catch {
        // Do not retain exception messages: they can contain signed URLs.
        if (tabs.get(tabId)?.get(frameId) === pending) frames.set(frameId, { ...pending, status: 'error' });
      }
      return true;
    },
  };
}

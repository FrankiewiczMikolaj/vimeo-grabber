import type { DetectionSource, ManifestReference, NormalisedVideo } from './model';
import { normalisePlayerConfig } from './normalise';

export const METADATA_LIMIT = 1_048_576;
export const METADATA_TIMEOUT = 8_000;
export type MetadataResult =
  | { readonly status: 'fetched'; readonly text: string }
  | { readonly status: 'permission-needed'; readonly origin: string }
  | { readonly status: 'failed'; readonly reason: 'source' | 'permission' | 'network' |
      'redirect' | 'http' | 'content-type' | 'size' | 'timeout' };
export interface InlineMetadata {
  readonly video: NormalisedVideo;
}
type Failure = Extract<MetadataResult, { status: 'failed' }>['reason'];
const fail = (reason: Failure): MetadataResult => ({ status: 'failed', reason });

function https(value: string): URL | null {
  try {
    const url = new URL(value);
    return value.trim() === value && url.protocol === 'https:' && !url.username &&
      !url.password && !url.port && !url.hash && !value.includes('\\') ? url : null;
  } catch { return null; }
}

function configIdentity(source: DetectionSource): string | null {
  const config = source.configUrl && https(source.configUrl);
  const frame = https(source.frameUrl);
  if (!frame || (source.configUrl !== null && (!config || config.hostname !== 'player.vimeo.com'))) return null;
  const id = config ? /^\/video\/([1-9]\d*)\/config$/.exec(config.pathname)?.[1] : null;
  const frameId = frame.hostname === 'player.vimeo.com'
    ? /^\/video\/([1-9]\d*)\/?$/.exec(frame.pathname)?.[1]
    : ['vimeo.com', 'www.vimeo.com'].includes(frame.hostname)
      ? /^\/([1-9]\d*)(?:\/[a-zA-Z0-9]+)?\/?$/.exec(frame.pathname)?.[1] : null;
  return source.configUrl === null ? frameId ?? null : id && id === frameId ? id : null;
}

/** Worker-local receipts bind manifests to fetched or trusted inline config data.
 * Callers must authenticate inline discovery; these APIs are not Chrome message handlers. */
export class MetadataTransport {
  private readonly receipts = new WeakMap<object, NormalisedVideo>();

  inline(config: unknown, source: DetectionSource): InlineMetadata | null {
    const id = configIdentity(source);
    if (!id) return null;
    const video = normalisePlayerConfig(config, { ...source });
    if (!video || video.id !== id) return null;
    const receipt = { video: structuredClone(video) };
    this.receipts.set(receipt, video);
    return receipt;
  }

  async config(source: DetectionSource): Promise<MetadataResult> {
    const id = configIdentity(source);
    if (!id || !source.configUrl) return fail('source');
    const snapshot = { ...source };
    const result = await this.request(source.configUrl, ['application/json']);
    if (result.status === 'fetched') {
      try {
        const video = normalisePlayerConfig(JSON.parse(result.text), snapshot);
        if (video?.id === id) this.receipts.set(result, video);
      } catch { /* Fetched bytes do not imply a usable config. */ }
    }
    return result;
  }

  async manifest(
    receipt: MetadataResult | InlineMetadata, video: NormalisedVideo, reference: ManifestReference,
  ): Promise<MetadataResult> {
    const owned = this.receipts.get(receipt);
    const same = (item: ManifestReference) => item.url === reference.url &&
      item.protocol === reference.protocol && item.cdn === reference.cdn;
    const url = https(reference.url);
    if (!owned || owned.id !== video.id || owned.source.frameUrl !== video.source.frameUrl ||
      owned.source.configUrl !== video.source.configUrl || !owned.manifests.some(same) ||
      !video.manifests.some(same) || !url ||
      !(url.hostname === 'vimeocdn.com' || url.hostname.endsWith('.vimeocdn.com'))) {
      return fail('source');
    }
    const types = reference.protocol === 'hls' && /\.m3u8$/.test(url.pathname)
      ? ['application/vnd.apple.mpegurl', 'application/x-mpegurl', 'audio/mpegurl']
      : reference.protocol === 'dash' && /\.json$/.test(url.pathname) ? ['application/json']
        : reference.protocol === 'dash' && /\.mpd$/.test(url.pathname)
          ? ['application/dash+xml', 'application/xml', 'text/xml'] : [];
    return types.length ? this.request(reference.url, types) : fail('source');
  }

  private async request(url: string, types: readonly string[]): Promise<MetadataResult> {
    const origin = new URL(url).origin;
    try {
      if (!await chrome.permissions.contains({ origins: [`${origin}/*`] })) {
        return { status: 'permission-needed', origin };
      }
    } catch { return fail('permission'); }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), METADATA_TIMEOUT);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await fetch(url, {
        credentials: 'omit', redirect: 'manual', referrerPolicy: 'no-referrer',
        cache: 'no-store', signal: controller.signal,
      });
      if (response.type === 'opaqueredirect' || response.redirected ||
        (response.status >= 300 && response.status < 400)) return fail('redirect');
      if (!response.ok) return fail('http');
      if (!types.includes((response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase())) {
        return fail('content-type');
      }
      if (Number(response.headers.get('content-length')) > METADATA_LIMIT) return fail('size');
      reader = response.body?.getReader();
      if (!reader) return fail('network');
      const decoder = new TextDecoder();
      const parts: string[] = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > METADATA_LIMIT) return fail('size');
        parts.push(decoder.decode(value, { stream: true }));
      }
      parts.push(decoder.decode());
      return { status: 'fetched', text: parts.join('') };
    } catch { return fail(controller.signal.aborted ? 'timeout' : 'network'); }
    finally {
      clearTimeout(timer);
      controller.abort();
      if (reader) await reader.cancel().catch(() => undefined);
    }
  }
}

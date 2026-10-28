import type { DetectionStatus, ManifestReference, Track } from './model';

type Attributes = Readonly<Record<string, string>>;
export interface HlsTrack extends Track {
  readonly attributes: Attributes;
}
export interface HlsAudioRendition {
  readonly groupId: string;
  readonly name: string;
  readonly uri: string | null;
  readonly language: string | null;
  readonly channels: string | null;
  readonly attributes: Attributes;
}
export interface HlsResult {
  readonly status: DetectionStatus;
  readonly tracks: readonly HlsTrack[];
  readonly audioGroups: readonly HlsAudioRendition[];
}

function attributes(text: string): Attributes {
  const result: Record<string, string> = {};
  while (text) {
    const match = /^([A-Z0-9-]+)=(?:"([^"\r\n]*)"|([^,\s"]+))(,|$)/.exec(text);
    if (!match || Object.hasOwn(result, match[1]) || (match[4] && match[0].length === text.length)) {
      throw new Error('Invalid attribute list');
    }
    result[match[1]] = match[2] ?? match[3];
    text = text.slice(match[0].length);
  }
  return result;
}
function positive(value: string | undefined): number | null {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
function resolve(uri: string, base: string): string {
  const url = new URL(uri, base);
  if (!uri || /\s/.test(uri) || url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Invalid playlist URL');
  }
  return url.href;
}

/** Shared metadata-only classification. Never follows key, license or media URLs. */
export function hlsProtection(text: string, urls: readonly string[]): 'protected' | 'unsupported' | null {
  if (urls.some(url => /(?:^|\/)drm(?:\/|$)/i.test(new URL(url).pathname))) return 'protected';
  let encrypted = false;
  for (const line of text.split(/\r?\n/).map(line => line.trim())) {
    if (!/^#EXT-X-(?:SESSION-KEY|KEY):/.test(line)) continue;
    const a = attributes(line.slice(line.indexOf(':') + 1));
    if (!a.METHOD) throw new Error('Missing key method');
    if (/^SAMPLE-AES(?:-CTR)?$/i.test(a.METHOD) ||
      /^(?:com\.apple\.streamingkeydelivery|com\.widevine(?:\.alpha)?|com\.microsoft\.playready|urn:uuid:(?:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed|9a04f079-9840-4286-ab92-e65be0885f95))$/i.test(a.KEYFORMAT ?? '')) {
      return 'protected';
    }
    encrypted ||= a.METHOD !== 'NONE' || (a.KEYFORMAT !== undefined && a.KEYFORMAT !== 'identity');
  }
  return encrypted ? 'unsupported' : null;
}

/** Metadata only. The caller authorises responseUrl and any subsequent requests. */
export function parseHls(text: string, manifest: ManifestReference, responseUrl = manifest.url): HlsResult {
  const empty = (status: DetectionStatus): HlsResult => ({ status, tracks: [], audioGroups: [] });
  try {
    if (manifest.protocol !== 'hls') return empty('unsupported');
    resolve(responseUrl, responseUrl);
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.shift() !== '#EXTM3U') return empty('unavailable');
    const audioGroups: HlsAudioRendition[] = [];
    const variants: { attributes: Attributes; uri: string }[] = [];
    let pending: Attributes | null = null;
    let unsupported = false;
    for (const line of lines) {
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        if (pending) throw new Error('Missing variant URI');
        pending = attributes(line.slice(18));
        if (!/^\d+$/.test(pending.BANDWIDTH) || !positive(pending.BANDWIDTH)) {
          throw new Error('Missing variant bandwidth');
        }
      } else if (line.startsWith('#EXT-X-MEDIA:')) {
        const a = attributes(line.slice(13));
        if (a.TYPE !== 'AUDIO') continue;
        if (!a['GROUP-ID'] || !a.NAME || audioGroups.some(g => g.groupId === a['GROUP-ID'] && g.name === a.NAME)) {
          throw new Error('Invalid audio rendition');
        }
        audioGroups.push({ groupId: a['GROUP-ID'], name: a.NAME,
          uri: a.URI === undefined ? null : resolve(a.URI, responseUrl),
          language: a.LANGUAGE ?? null, channels: a.CHANNELS ?? null, attributes: a });
      } else if (/^#EXT-X-(SESSION-KEY|KEY):/.test(line)) {
        // Classified once below, together with the actual video/audio locators.
      } else if (/^#EXT(?:INF:|-X-(?:TARGETDURATION:|MAP:|I-FRAME-STREAM-INF:|DEFINE:))/.test(line)) {
        unsupported = true;
      } else if (!line.startsWith('#')) {
        if (!pending && unsupported) continue;
        if (!pending) throw new Error('Unexpected URI');
        variants.push({ attributes: pending, uri: resolve(line, responseUrl) });
        pending = null;
      }
    }
    if (pending) throw new Error('Missing variant URI');
    const protection = hlsProtection(text, [manifest.url, responseUrl, ...variants.map(v => v.uri),
      ...audioGroups.flatMap(group => group.uri === null || /\.vtt$/i.test(new URL(group.uri).pathname) ? [] : [group.uri])]);
    const protectedContent = protection === 'protected';
    unsupported ||= protection === 'unsupported';
    const tracks: HlsTrack[] = variants.map(({ attributes: a, uri }, index) => {
      const groupId = a.AUDIO ?? null;
      const group = audioGroups.filter(g => g.groupId === groupId);
      if (groupId !== null && !group.length) throw new Error('Missing audio group');
      const codecs = a.CODECS?.split(',').map(codec => codec.trim()) ?? [];
      const audioOnly = codecs.length > 0 && codecs.every(codec => /^(mp4a\.|ac-3$|ec-3$|opus$|flac$)/i.test(codec));
      const videoOnly = codecs.length > 0 && codecs.every(codec => /^(avc[13]\.|hev1\.|hvc1\.|vp09\.|av01\.)/i.test(codec));
      const externalAudio = group.length > 0 && group.every(g => g.uri !== null);
      const resolution = /^(\d+)x(\d+)$/.exec(a.RESOLUTION ?? '');
      return { id: `variant:${index}`, groupId, kind: audioOnly ? 'audio' :
        externalAudio || (videoOnly && groupId === null) ? 'video' : 'combined', manifest,
      download: protectedContent || unsupported ? { kind: 'unavailable', reason: protectedContent ? 'protected' : 'unsupported' } :
        { kind: 'playlist', url: uri }, attributes: a,
      codec: a.CODECS ?? null, mimeType: null, bandwidth: positive(a.BANDWIDTH),
      width: resolution ? positive(resolution[1]) : null, height: resolution ? positive(resolution[2]) : null,
      frameRate: positive(a['FRAME-RATE']), language: null, channels: null };
    });
    // A missing URI denotes in-band audio, not a separately retrievable playlist.
    for (const [index, group] of audioGroups.entries()) {
      if (group.uri === null) continue;
      tracks.push({ id: `audio:${index}`, groupId: group.groupId, kind: 'audio', manifest,
        download: protectedContent || unsupported ? { kind: 'unavailable', reason: protectedContent ? 'protected' : 'unsupported' } :
          { kind: 'playlist', url: group.uri }, attributes: group.attributes, codec: null, mimeType: null,
        bandwidth: null, width: null, height: null, frameRate: null,
        language: group.language, channels: group.channels });
    }
    return { status: protectedContent ? 'protected' : unsupported || !variants.length ? 'unsupported' : 'found',
      tracks, audioGroups };
  } catch {
    return empty('unavailable');
  }
}

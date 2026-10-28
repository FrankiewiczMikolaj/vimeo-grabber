import type { DownloadResource, Track } from '../detect/model';
import { validateInitialization } from './initialization.ts';

export const limits = { playlist: 1024 * 1024, chunk: 1024 * 1024, file: 4 * 1024 ** 3, resources: 10000 };

export function mediaPlaylist(text: string, base: string): readonly DownloadResource[] {
  const lines = text.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.shift() !== '#EXTM3U' || !lines.includes('#EXT-X-ENDLIST')) throw new Error('Unsupported live or malformed HLS');
  const resources: DownloadResource[] = [];
  let pending = false;
  for (const line of lines) {
    if (line.startsWith('#EXT-X-MAP:')) {
      const match = /^#EXT-X-MAP:URI="([^"\r\n]+)"$/.exec(line);
      if (!match || resources.length) throw new Error('Unsupported HLS initialization');
      resources.push({ role: 'initialization', kind: 'url', url: new URL(match[1], base).href });
    } else if (line.startsWith('#EXTINF:')) {
      if (pending) throw new Error('Missing HLS segment');
      pending = true;
    } else if (line.startsWith('#')) {
      if (!/^#EXT-X-(?:VERSION:\d+|TARGETDURATION:\d+|MEDIA-SEQUENCE:\d+|PLAYLIST-TYPE:VOD|ENDLIST|INDEPENDENT-SEGMENTS)$/.test(line)) {
        throw new Error('Protected or unsupported HLS directive');
      }
    } else {
      if (!pending || !resources.length) throw new Error('Missing initialization or segment declaration');
      resources.push({ role: 'media', kind: 'url', url: new URL(line, base).href });
      pending = false;
    }
  }
  if (pending || resources.length < 2 || resources.length > limits.resources) throw new Error('Invalid HLS resources');
  return resources;
}

export async function assemble(track: Track, writer: FileSystemWritableFileStream,
  authority: (url?: string) => Promise<void>, signal: AbortSignal, progress: (bytes: number) => void) {
  async function request(url: string) {
    await authority(url);
    const response = await fetch(url, { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal });
    if (!response.ok || !response.body || response.redirected || response.url !== url) throw new Error('Media request failed');
    return response;
  }
  async function consume(response: Response, maximum: number, accept: (chunk: Uint8Array) => Promise<void>) {
    const reader = response.body!.getReader();
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (value.byteLength > limits.chunk || size > maximum) throw new Error('Media size limit exceeded');
        await authority();
        signal.throwIfAborted();
        await accept(value);
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
  }
  let resources: readonly DownloadResource[];
  if (track.download.kind === 'playlist') {
    const response = await request(track.download.url);
    const decoder = new TextDecoder();
    let text = '';
    await consume(response, limits.playlist, async chunk => { text += decoder.decode(chunk, { stream: true }); });
    resources = mediaPlaylist(text + decoder.decode(), response.url);
  } else if (track.download.kind === 'resources') resources = track.download.resources;
  else throw new Error('Track unavailable');
  if (resources.length < 2 || resources.length > limits.resources) throw new Error('Invalid resource count');
  // Authorise the complete plan before any segment request. Never prompt for unseen origins.
  for (const resource of resources) if (resource.kind === 'url') await authority(resource.url);
  let bytes = 0;
  for (const [index, resource] of resources.entries()) {
    if (resource.role !== (index === 0 ? 'initialization' : 'media')) throw new Error('Invalid resource order');
    const append = async (chunk: Uint8Array) => {
      bytes += chunk.byteLength;
      if (bytes > limits.file) throw new Error('File exceeds 4 GiB limit');
      await writer.write(chunk as Uint8Array<ArrayBuffer>);
      progress(bytes);
    };
    if (index === 0) {
      let initialization: Uint8Array;
      if (resource.kind === 'inline-base64') {
        if (resource.data.length > 87384) throw new Error('Initialization limit exceeded');
        initialization = Uint8Array.from(atob(resource.data), char => char.charCodeAt(0));
      } else {
        const buffer = new Uint8Array(limits.chunk);
        let size = 0;
        await consume(await request(resource.url), buffer.length, async chunk => { buffer.set(chunk, size); size += chunk.length; });
        initialization = buffer.subarray(0, size);
      }
      validateInitialization(initialization, track.kind);
      await append(initialization);
    } else if (resource.kind === 'url') await consume(await request(resource.url), limits.file - bytes, append);
    else throw new Error('Invalid inline media');
  }
}

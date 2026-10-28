import type { DownloadResource, Track } from '../detect/model';
import { hlsProtection } from '../detect/hls.ts';
import { validateInitialization } from './initialization.ts';

export const limits = { playlist: 1024 * 1024, initialization: 1024 * 1024, segment: 64 * 1024 ** 2, file: 4 * 1024 ** 3, resources: 10000 };

export function mediaPlaylist(text: string, base: string): readonly DownloadResource[] {
  const protection = hlsProtection(text, [base]);
  if (protection === 'protected') throw new Error('Protected (DRM), cannot download');
  if (protection === 'unsupported') throw new Error('Unsupported HLS encryption');
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
      if (/^#EXT-X-(?:SESSION-KEY|KEY):/.test(line)) continue; // Only METHOD=NONE reaches here.
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
  authority: (url?: string) => Promise<void>, signal: AbortSignal,
  progress: (bytes: number, done: number, total: number, message?: string) => void,
  directory: FileSystemDirectoryHandle) {
  const stop = new AbortController();
  const active = AbortSignal.any([signal, stop.signal]);
  class Transient extends Error {}
  async function request(url: string) {
    active.throwIfAborted();
    await authority(url);
    let response: Response;
    try {
      response = await fetch(url, { credentials: 'omit', redirect: 'manual', referrerPolicy: 'no-referrer', signal: active });
    } catch { active.throwIfAborted(); throw new Transient('Media request failed'); }
    if ([408, 429, 500, 502, 503, 504].includes(response.status)) {
      await response.body?.cancel();
      throw new Transient('Media request failed');
    }
    if (!response.ok || !response.body || response.redirected || response.url !== url) {
      await response.body?.cancel();
      throw new Error('Media request failed');
    }
    return response;
  }
  async function consume(response: Response, maximum: number, accept: (chunk: Uint8Array) => Promise<void>) {
    const reader = response.body!.getReader();
    let size = 0;
    try {
      while (true) {
        let result: ReadableStreamReadResult<Uint8Array>;
        try { result = await reader.read(); }
        catch { active.throwIfAborted(); throw new Transient('Media request failed'); }
        if (result.done) break;
        size += result.value.byteLength;
        if (size > maximum) throw new Error('Media size limit exceeded');
        await authority();
        active.throwIfAborted();
        await accept(result.value);
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  let bytes = 0;
  let done = 0;
  let total = 0;
  async function retry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await operation(); }
      catch (error) {
        active.throwIfAborted();
        if (!(error instanceof Transient) || attempt === 3) throw error;
        await authority();
        progress(bytes, done, total, `Retry ${attempt + 1}/3 after transient media failure`);
        // ES2022 target: Promise.withResolvers is not in the supported library.
        await new Promise<void>((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(active.reason); };
          const timer = setTimeout(() => { active.removeEventListener('abort', abort); resolve(); }, 200 * (attempt + 1));
          active.addEventListener('abort', abort, { once: true });
          if (active.aborted) abort();
        });
      }
    }
  }
  let resources: readonly DownloadResource[];
  if (track.download.kind === 'playlist') {
    resources = await retry(async () => {
      const response = await request(track.download.kind === 'playlist' ? track.download.url : '');
      const decoder = new TextDecoder();
      let text = '';
      await consume(response, limits.playlist, async chunk => { text += decoder.decode(chunk, { stream: true }); });
      return mediaPlaylist(text + decoder.decode(), response.url);
    });
  } else if (track.download.kind === 'resources') resources = track.download.resources;
  else throw new Error('Track unavailable');
  if (resources.length < 2 || resources.length > limits.resources) throw new Error('Invalid resource count');
  for (const [index, resource] of resources.entries()) {
    if (resource.role !== (index === 0 ? 'initialization' : 'media') || (index > 0 && resource.kind !== 'url')) throw new Error('Invalid resource order');
    if (resource.kind === 'url') await authority(resource.url);
  }
  total = resources.length - 1;
  const first = resources[0];
  let initialization: Uint8Array;
  if (first.kind === 'inline-base64') {
    if (first.data.length > 87384) throw new Error('Initialization limit exceeded');
    initialization = Uint8Array.from(atob(first.data), char => char.charCodeAt(0));
  } else {
    initialization = await retry(async () => {
      const buffer = new Uint8Array(limits.initialization);
      let size = 0;
      await consume(await request(first.url), buffer.length, async chunk => { buffer.set(chunk, size); size += chunk.length; });
      return buffer.subarray(0, size);
    });
  }
  validateInitialization(initialization, track.kind);
  await writer.write(initialization as Uint8Array<ArrayBuffer>);
  bytes = initialization.length;
  progress(bytes, done, total);
  // Five disk-backed slots bound lookahead even when the earliest response stalls.
  // No next batch starts until this batch has been written in source order.
  for (let start = 1; start < resources.length; start += 5) {
    const batch = resources.slice(start, start + 5);
    const staged = batch.map(() => 0);
    const received = () => bytes + staged.reduce((sum, size) => sum + size, 0);
    const jobs = batch.map((resource, slot) => retry(async () => {
      if (resource.kind !== 'url') throw new Error('Invalid inline media');
      staged[slot] = 0;
      const file = await directory.getFileHandle(`segment-${slot}`, { create: true });
      const temporary = await file.createWritable();
      try {
        await consume(await request(resource.url), limits.segment, async chunk => {
          await temporary.write(chunk as Uint8Array<ArrayBuffer>);
          staged[slot] += chunk.length;
          if (received() > limits.file) throw new Error('File exceeds 4 GiB limit');
          progress(received(), done, total);
        });
        await temporary.close();
      } catch (error) { await temporary.abort().catch(() => {}); throw error; }
      return file.getFile();
    }).catch(error => { stop.abort(error); throw error; }));
    try {
      // Observe every rejection immediately, including a later slot failing first.
      const settled = Promise.all(jobs);
      await settled;
      for (const [slot, job] of jobs.entries()) {
        const file = await job;
        if (bytes + file.size > limits.file) throw new Error('File exceeds 4 GiB limit');
        const reader = file.stream().getReader();
        try {
          while (true) {
            const { value, done: end } = await reader.read();
            if (end) break;
            await authority(); active.throwIfAborted();
            await writer.write(value as Uint8Array<ArrayBuffer>);
            bytes += value.length;
            staged[slot] -= value.length;
            progress(received(), done, total);
          }
        } finally { await reader.cancel(); reader.releaseLock(); }
        done++;
        progress(received(), done, total);
      }
    } finally {
      await Promise.allSettled(jobs);
      for (let slot = 0; slot < batch.length; slot++) await directory.removeEntry(`segment-${slot}`).catch(() => {});
    }
  }
}

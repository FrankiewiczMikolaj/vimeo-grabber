import type { FrameCandidate } from '../detect/frame-state';
import { selection } from './select';
import { assemble } from './assemble';

const token = location.hash.slice(1);
const status = document.querySelector<HTMLElement>('#status')!;
const outcomes = document.querySelector<HTMLElement>('#outcomes')!;
const cancel = document.querySelector<HTMLButtonElement>('#cancel')!;
const controller = new AbortController();
cancel.onclick = () => controller.abort(new Error('Cancelled'));
let activeDownload: number | undefined;
addEventListener('pagehide', () => {
  controller.abort();
  if (activeDownload !== undefined) void chrome.downloads.cancel(activeDownload);
});

async function source(): Promise<{ candidate: FrameCandidate; trackId: string } | null> {
  return chrome.runtime.sendMessage({ type: 'download-source', token });
}

async function run() {
  const current = await source();
  if (!current) throw new Error('Source document is no longer available');
  const candidate = current.candidate;
  const tracks = selection(candidate, current.trackId);
  if (!tracks.length) throw new Error('No supported separate tracks');
  const identity = JSON.stringify(current);
  async function authority(value?: string) {
    controller.signal.throwIfAborted();
    if (JSON.stringify(await source()) !== identity) throw new Error('Source changed or permission revoked');
    const url = new URL(value ?? candidate.manifest!.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
      !(url.hostname === 'vimeocdn.com' || url.hostname.endsWith('.vimeocdn.com')) ||
      !await chrome.permissions.contains({ origins: [`${url.origin}/*`] })) throw new Error('Exact-origin permission required');
  }
  await authority();
  // One owner at a time: a new page cleans only orphan data, never another live job.
  await navigator.locks.request('vimeo-download-owner', { signal: controller.signal }, async () => {
    const root = await navigator.storage.getDirectory();
    try { await root.removeEntry('vimeo-download', { recursive: true }); } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
    }
    const directory = await root.getDirectoryHandle('vimeo-download', { create: true });
    let completed = 0;
    try {
      for (const [index, track] of tracks.entries()) {
        const row = document.createElement('li');
        const name = `vimeo-${candidate.videoId}-${track.kind}-${index + 1}.${track.kind === 'audio' ? 'm4a' : 'mp4'}`;
        outcomes.append(row);
        let objectUrl: string | undefined;
        let writer: FileSystemWritableFileStream | undefined;
        const deadline = setTimeout(() => controller.abort(new Error('Timed out after 10 minutes')), 600000);
        try {
          status.textContent = 'Download in progress. Keep this download page open; the popup may close.';
          const file = await directory.getFileHandle(String(index), { create: true });
          writer = await file.createWritable();
          await assemble(track, writer, authority, controller.signal, bytes => {
            row.textContent = `${name}: assembling ${bytes} bytes`;
          });
          await writer.close(); writer = undefined;
          await authority();
          const assembled = await file.getFile();
          objectUrl = URL.createObjectURL(assembled.slice(0, assembled.size, `${track.kind}/mp4`));
          activeDownload = await chrome.downloads.download({ url: objectUrl, filename: name, conflictAction: 'uniquify', saveAs: false });
          // Read native state, including actual absolute filename; started is not completed.
          while (true) {
            await authority();
            const [item] = await chrome.downloads.search({ id: activeDownload });
            if (!item || item.state === 'interrupted') throw new Error(item?.error ?? 'Native download disappeared');
            row.textContent = `${name}: saving ${item.bytesReceived}/${item.totalBytes} bytes`;
            if (item.state === 'complete') {
              if (!item.filename.startsWith('/')) throw new Error('Absolute completed path unavailable');
              row.textContent = `${name}: complete — ${item.filename}`;
              row.dataset.path = item.filename;
              row.dataset.state = 'complete';
              completed++;
              activeDownload = undefined;
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } catch (error) {
          if (activeDownload !== undefined) await chrome.downloads.cancel(activeDownload).catch(() => {});
          activeDownload = undefined;
          await writer?.abort().catch(() => {});
          row.dataset.state = 'failed';
          // Fetch errors can contain signed URLs. Keep the user-facing error bounded and private.
          row.textContent = `${name}: failed (${error instanceof Error && /^(Cancelled|Timed out|Source|Exact-origin|Protected|Unsupported|No supported)/.test(error.message) ? error.message : 'assembly or native download failed'})`;
        } finally {
          clearTimeout(deadline);
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          await directory.removeEntry(String(index)).catch(() => {});
        }
      }
      status.textContent = completed === tracks.length ? (tracks.length === 2 ? 'Both files completed.' : 'Audio file completed.') :
        completed ? 'Partial failure. The completed file is kept; the companion failed.' : 'Download failed. No paired success.';
    } finally { await root.removeEntry('vimeo-download', { recursive: true }); }
  });
}
void run().catch(() => { status.textContent = 'Download unavailable: source, permission, storage or track is no longer valid.'; })
  .finally(() => { cancel.disabled = true; });

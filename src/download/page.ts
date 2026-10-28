import '../popup.css';
import type { FrameCandidate } from '../detect/frame-state';
import { selection } from './select';
import { assemble } from './assemble';
import { filenameStem, trackFilename } from './filename';
import { mergeCommand } from '../shell/linux';

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
  const stem = filenameStem(candidate.title, candidate.videoId);
  const paths = new Map<string, string>();
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
        const detail = document.createElement('span');
        const bar = document.createElement('progress');
        bar.setAttribute('aria-label', `${track.kind} segments`);
        row.append(detail, bar);
        let segmentSummary = '';
        let retryNotice = '';
        const name = trackFilename(stem, track.kind, track.height);
        outcomes.append(row);
        let objectUrl: string | undefined;
        let writer: FileSystemWritableFileStream | undefined;
        let lastProgress = performance.now();
        let received = -1;
        const deadline = setInterval(() => {
          if (performance.now() - lastProgress >= 30000) controller.abort(new Error('Timed out after 30 seconds without progress'));
        }, 1000);
        try {
          status.textContent = 'Download in progress. Keep this tab open until finished; the popup may close.';
          const file = await directory.getFileHandle(String(index), { create: true });
          writer = await file.createWritable();
          await assemble(track, writer, authority, controller.signal, (bytes, done, total, message) => {
            lastProgress = performance.now();
            if (message) retryNotice = ` — ${message}`;
            bar.max = total; bar.value = done;
            segmentSummary = `${done}/${total} segments, ${(bytes / 1024 ** 2).toFixed(2)} MB`;
            detail.textContent = `${name}: ${segmentSummary}${retryNotice}`;
          }, directory);
          await writer.close(); writer = undefined;
          await authority();
          const assembled = await file.getFile();
          objectUrl = URL.createObjectURL(assembled.slice(0, assembled.size, `${track.kind}/mp4`));
          activeDownload = await chrome.downloads.download({ url: objectUrl, filename: name, conflictAction: 'uniquify', saveAs: false });
          // Read native state, including actual absolute filename; started is not completed.
          while (true) {
            await authority();
            const [item] = await chrome.downloads.search({ id: activeDownload });
            if (!item || item.state === 'interrupted') throw new Error(`Native download ${item?.error ?? 'disappeared'}`);
            detail.textContent = `${name}: ${segmentSummary} — saving ${(item.bytesReceived / 1024 ** 2).toFixed(2)}/${(item.totalBytes / 1024 ** 2).toFixed(2)} MB`;
            if (item.bytesReceived !== received) { received = item.bytesReceived; lastProgress = performance.now(); }
            if (item.state === 'complete') {
              if (!item.filename.startsWith('/')) throw new Error('Absolute completed path unavailable');
              detail.textContent = `${name}: ${segmentSummary} — complete — ${item.filename}`;
              row.dataset.path = item.filename;
              row.dataset.state = 'complete';
              completed++;
              paths.set(track.kind, item.filename);
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
          const reason = error instanceof DOMException && error.name === 'QuotaExceededError' ? 'temporary storage quota exceeded' :
            error instanceof Error && /^(Cancelled|Timed out|Source|Exact-origin|Protected|Unsupported|No supported|Media request failed|Media size limit|File exceeds|Initialization limit|Native download)/.test(error.message)
              ? error.message : 'assembly or native download failed';
          detail.textContent = `${name}: ${segmentSummary} — failed (${reason})`;
        } finally {
          clearInterval(deadline);
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          await directory.removeEntry(String(index)).catch(() => {});
        }
      }
      status.textContent = completed === tracks.length ? (tracks.length === 2 ? 'Both files completed.' : 'Audio file completed.') :
        completed ? 'Partial failure. The completed file is kept; the companion failed.' : 'Download failed. No paired success.';
      if (tracks.length === 2 && completed === 2 && !controller.signal.aborted) {
        const section = document.createElement('section');
        const command = document.createElement('pre');
        command.id = 'merge-command';
        command.style.whiteSpace = 'pre-wrap';
        command.textContent = mergeCommand(paths.get('video')!, paths.get('audio')!,
          paths.get('video')!.split('/').at(-1)!.replace(/\.mp4$/, '.merged.mp4'));
        const copy = document.createElement('button');
        copy.textContent = 'Copy command';
        const feedback = document.createElement('p');
        feedback.setAttribute('role', 'status');
        copy.onclick = async () => {
          try {
            await navigator.clipboard.writeText(command.textContent!);
            feedback.textContent = 'Command copied.';
          } catch {
            feedback.textContent = 'Copy failed. Select and copy the command manually.';
          }
        };
        const guidance = document.createElement('p');
        guidance.textContent = 'Linux bash/zsh: check ffmpeg -version. If missing, install with sudo apt install ffmpeg. Run this command in your terminal. Existing output is not overwritten; source files are kept. Use at your own risk and only for content you have rights to download.';
        section.append(command, copy, feedback, guidance);
        outcomes.after(section);
      }
    } finally { await root.removeEntry('vimeo-download', { recursive: true }); }
  });
}
void run().catch(() => { status.textContent = 'Download unavailable: source, permission, storage or track is no longer valid.'; })
  .finally(() => { cancel.disabled = true; });

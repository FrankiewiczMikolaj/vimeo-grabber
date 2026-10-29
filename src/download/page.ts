import '../popup.css';
import type { FrameCandidate } from '../detect/frame-state';
import { selection } from './select';
import { assemble } from './assemble';
import { filenameStem, trackFilename } from './filename';
import { mergeCommand } from '../shell/linux';
import { rightsAcknowledged } from '../rights';
import { NativeSaveError } from './native-error';
import { progressiveUrl } from '../detect/progressive';

const token = location.hash.slice(1);
const status = document.querySelector<HTMLElement>('#status')!;
const outcomes = document.querySelector<HTMLElement>('#outcomes')!;
const cancel = document.querySelector<HTMLButtonElement>('#cancel')!;
const lifetime = new AbortController();
const attempts = new Set<AbortController>();
cancel.onclick = () => {
  for (const attempt of attempts) attempt.abort(new Error('Cancelled'));
};
addEventListener('pagehide', () => lifetime.abort(new Error('Cancelled')));
// The owner answers only the real popup, never a page or a content script.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.tab || sender.url !== chrome.runtime.getURL('popup.html')
    || message?.type !== 'download-progress' || message.token !== token) return;
  void rightsAcknowledged().then(acknowledged => respond(acknowledged ? {
    status: status.textContent,
    tracks: Array.from(outcomes.querySelectorAll('li'), row => {
      const bar = row.querySelector('progress')!;
      return `${bar.getAttribute('aria-label')}: ${bar.value}/${bar.max}${row.dataset.state ? ` — ${row.dataset.state}` : ''}`;
    }),
  } : null));
  return true;
});

async function source(): Promise<{ candidate: FrameCandidate; trackId: string } | null> {
  if (!await rightsAcknowledged()) return null;
  return chrome.runtime.sendMessage({ type: 'download-source', token });
}


async function save(url: string, filename: string, authority: () => Promise<void>, signal: AbortSignal) {
  await authority();
  // The extension targets ES2022, before Promise.withResolvers.
  return new Promise<chrome.downloads.DownloadItem>((resolve, reject) => {
    let failure: unknown;
    let checking = false;
    let settled = false;
    let activeDownload: number | undefined;
    const cleanup = () => {
      settled = true;
      clearInterval(validation);
      signal.removeEventListener('abort', abort);
      chrome.downloads.onChanged.removeListener(changed);
      activeDownload = undefined;
    };
    const inspect = async () => {
      if (activeDownload === undefined || settled) return;
      try {
        const [item] = await chrome.downloads.search({ id: activeDownload });
        if (!item || item.state === 'in_progress' || settled) return;
        cleanup();
        // Completion wins a cancellation race: never retry an already saved file.
        if (item.state === 'complete') resolve(item);
        else reject(failure ?? new NativeSaveError(item.error));
      } catch (error) { failure = error; abort(); }
    };
    const abort = () => {
      failure ??= signal.reason;
      if (activeDownload !== undefined && !settled) {
        void chrome.downloads.cancel(activeDownload).catch(() => {}).then(inspect);
      }
    };
    const changed = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id === activeDownload && delta.state) void inspect();
    };
    // Subscribe before starting; the initial read also catches completion before the ID arrives.
    chrome.downloads.onChanged.addListener(changed);
    signal.addEventListener('abort', abort);
    const validation = setInterval(() => {
      if (checking || failure) return;
      checking = true;
      void authority().catch(error => {
        if (!settled) { failure = error; abort(); }
      }).finally(() => { checking = false; });
    }, 1000);
    void chrome.downloads.download({ url, filename, conflictAction: 'uniquify', saveAs: false }).then(id => {
      activeDownload = id;
      if (failure || signal.aborted) abort();
      void inspect();
    }, error => {
      cleanup();
      reject(failure ?? (signal.aborted ? signal.reason : /USER_CANCELED|cancel(?:ed|led)/i.test(String(error))
        ? new NativeSaveError('USER_CANCELED') : new Error('Native download could not start')));
    });
  });
}
async function run() {
  const current = await source();
  if (!current) throw new Error('Source document is no longer available');
  const candidate = current.candidate;
  const tracks = selection(candidate, current.trackId);
  if (!tracks.length) throw new Error('No supported tracks');
  if (tracks[0].kind === 'combined') {
    document.querySelector<HTMLElement>('#guidance')!.textContent = 'This MP4 contains video and audio. No merge is needed.';
  }
  // Initial admission fixes the source and tracks. Later source-tab changes do not revoke it.
  const stem = filenameStem(candidate.title, candidate.videoId);
  const paths = new Map<string, string>();
  async function authority(value?: string) {
    lifetime.signal.throwIfAborted();
    if (!await rightsAcknowledged()) throw new Error('Source rights acknowledgement required');
    const url = new URL(value ?? candidate.manifest!.url);
    if (candidate.manifest?.protocol === 'progressive') {
      if (url.href !== new URL(candidate.manifest.url).href || !progressiveUrl(value ?? candidate.manifest.url)) {
        throw new Error('Unapproved media source');
      }
      return;
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
      !(url.hostname === 'vimeocdn.com' || url.hostname.endsWith('.vimeocdn.com'))) throw new Error('Unapproved media source');
  }
  await authority();
  const jobs = tracks.map(track => {
    const row = document.createElement('li');
    const detail = document.createElement('span');
    const bar = document.createElement('progress');
    bar.setAttribute('aria-label', `${track.kind} ${track.kind === 'combined' ? 'bytes' : 'segments'}`);
    const stop = document.createElement('button');
    stop.textContent = 'Cancel file';
    stop.setAttribute('aria-label', `Cancel ${track.kind}`);
    const retry = document.createElement('button');
    retry.textContent = 'Retry';
    retry.setAttribute('aria-label', `Retry ${track.kind}`);
    retry.disabled = true;
    row.append(detail, bar, stop, retry);
    outcomes.append(row);
    return { track, row, detail, bar, stop, retry, controller: new AbortController() };
  });
  let running = false;
  let commandSection: HTMLElement | undefined;
  async function drain() {
    if (running) return;
    running = true;
    cancel.disabled = false;
    commandSection?.remove();
    commandSection = undefined;
    try {
      // Serialize owners and attempts; never remove another live owner's temporary data.
      await navigator.locks.request('vimeo-download-owner', { signal: lifetime.signal }, async () => {
        const root = await navigator.storage.getDirectory();
        try { await root.removeEntry('vimeo-download', { recursive: true }); } catch (error) {
          if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
        }
        let job: typeof jobs[number] | undefined;
        while ((job = jobs.find(value => value.row.dataset.state === 'queued' || value.row.dataset.state === 'retrying'))) {
          const { track, row, detail, bar, stop, retry, controller } = job;
          const signal = AbortSignal.any([lifetime.signal, controller.signal]);
          const check = async (url?: string) => { signal.throwIfAborted(); await authority(url); signal.throwIfAborted(); };
          const name = track.kind === 'combined' ? `${stem} [${track.height ? `${track.height}p` : 'original'}].mp4` :
            trackFilename(stem, track.kind, track.height);
          let segmentSummary = '';
          let retryNotice = '';
          let objectUrl: string | undefined;
          let writer: FileSystemWritableFileStream | undefined;
          let lastProgress = performance.now();
          const deadline = setInterval(() => {
            if (performance.now() - lastProgress >= 30000) controller.abort(new Error('Timed out after 30 seconds without progress'));
          }, 1000);
          try {
            await check();
            const directory = await root.getDirectoryHandle('vimeo-download', { create: true });
            row.dataset.state = 'fetching';
            status.textContent = 'Download in progress. Keep this tab open until finished; the popup may close.';
            const file = await directory.getFileHandle('output', { create: true });
            writer = await file.createWritable();
            await assemble(track, writer, check, signal, (bytes, done, total, message) => {
              lastProgress = performance.now();
              retryNotice = message ? ` — ${message}` : '';
              bar.max = total || 1;
              if (total) bar.value = done;
              else bar.removeAttribute('value');
              segmentSummary = track.kind === 'combined' ? `${(bytes / 1024 ** 2).toFixed(2)} MiB` :
                `${done}/${total} segments, ${(bytes / 1024 ** 2).toFixed(2)} MiB`;
              detail.textContent = `${name}: ${segmentSummary}${retryNotice}`;
            }, directory);
            clearInterval(deadline);
            await writer.close(); writer = undefined;
            await check();
            const assembled = await file.getFile();
            objectUrl = URL.createObjectURL(assembled.slice(0, assembled.size, `${track.kind === 'combined' ? 'video' : track.kind}/mp4`));
            detail.textContent = `${name}: ${segmentSummary} — waiting for native save`;
            row.dataset.state = 'saving';
            const item = await save(objectUrl, name, check, signal);
            if (!item.filename.startsWith('/')) throw new Error('Absolute completed path unavailable');
            detail.textContent = `${name}: ${segmentSummary} — complete — ${item.filename}`;
            row.dataset.path = item.filename;
            row.dataset.state = 'complete';
            stop.disabled = true;
            paths.set(track.kind, item.filename);
          } catch (error) {
            if (error instanceof NativeSaveError) row.dataset.failure = error.category;
            await writer?.abort().catch(() => {});
            row.dataset.state = signal.aborted && signal.reason instanceof Error && signal.reason.message === 'Cancelled' ||
              error instanceof NativeSaveError && error.category === 'cancelled' ? 'cancelled' : 'failed';
            // Never show arbitrary exception text: it can contain signed source URLs.
            const reason = error instanceof DOMException && error.name === 'QuotaExceededError' ? 'temporary storage quota exceeded' :
              error instanceof Error && /^(Cancelled|Save cancelled|Timed out after 30 seconds without progress|Source rights acknowledgement required|Unapproved media source|Protected \(DRM\), cannot download|Unsupported HLS encryption|Media network lost|Media HTTP \d{3}|Media request failed|Media size limit exceeded|File exceeds 4 GiB limit|Initialization limit exceeded|Native disk full|Native download [A-Z_]+|Native download interrupted|Native download could not start)$/.test(error.message)
                ? error.message : 'temporary storage or assembly failed';
            detail.textContent = `${name}: ${segmentSummary} — ${row.dataset.state} (${reason}). Incomplete native output, if retained by Chromium, is partial (.crdownload), not a completed file.`;
          } finally {
            clearInterval(deadline);
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            attempts.delete(controller);
            stop.disabled = true;
            // Retry becomes available only after all requests, writers and owned partials are gone.
            await root.removeEntry('vimeo-download', { recursive: true }).catch(error => {
              if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
            });
            retry.disabled = row.dataset.state === 'complete';
          }
        }
      });
      const completed = paths.size;
      status.textContent = completed === tracks.length ? (tracks.length === 2 ? 'Both files completed.' :
        tracks[0].kind === 'combined' ? 'MP4 file completed.' : 'Audio file completed.') :
        completed ? 'Partial failure. The completed file is kept; the companion failed.' : 'Download failed. No files completed.';
      if (tracks.length === 2 && completed === 2) {
        if (!await rightsAcknowledged()) return;
        const section = document.createElement('section');
        commandSection = section;
        const command = document.createElement('pre');
        command.id = 'merge-command';
        command.style.whiteSpace = 'pre-wrap';
        command.textContent = mergeCommand(paths.get('video')!, paths.get('audio')!,
          `${stem}.mp4`);
        const copy = document.createElement('button');
        copy.textContent = 'Copy command';
        const feedback = document.createElement('p');
        feedback.setAttribute('role', 'status');
        copy.onclick = async () => {
          try {
            if (!await rightsAcknowledged()) {
              copy.disabled = true;
              feedback.textContent = 'Rights acknowledgement required. Reopen the popup to acknowledge.';
              return;
            }
            await navigator.clipboard.writeText(command.textContent!);
            feedback.textContent = 'Command copied.';
          } catch {
            feedback.textContent = 'Copy failed. Select and copy the command manually.';
          }
        };
        chrome.storage.onChanged.addListener((_changes, area) => {
          if (area !== 'local') return;
          copy.disabled = true;
          void rightsAcknowledged().then(value => { copy.disabled = !value; });
        });
        const guidance = document.createElement('p');
        guidance.textContent = 'Linux bash/zsh: check ffmpeg -version. If missing, install with sudo apt install ffmpeg. Run this command in your terminal. Existing output is not overwritten; source files are kept. If the output exists, change only the final output path in the command to an unused name, or rename the existing file. Keep both input paths unchanged. Use at your own risk and only for content you have rights to download.';
        section.append(command, copy, feedback, guidance);
        outcomes.after(section);
      }
    } finally {
      running = false;
      cancel.disabled = true;
    }
  }
  for (const job of jobs) {
    const enqueue = (restarting = false) => {
      job.controller = new AbortController();
      attempts.add(job.controller);
      job.row.dataset.state = restarting ? 'retrying' : 'queued';
      delete job.row.dataset.failure;
      job.bar.value = 0;
      job.detail.textContent = `${trackFilename(stem, job.track.kind, job.track.height)}: ${restarting ? 'retrying from initialization' : 'queued'}`;
      job.stop.disabled = false;
      job.retry.disabled = true;
    };
    enqueue();
    job.stop.onclick = () => job.controller.abort(new Error('Cancelled'));
    job.retry.onclick = () => {
      if (job.retry.disabled || lifetime.signal.aborted) return;
      enqueue(true);
      void drain().catch(unavailable);
    };
  }
  await drain();
}
function unavailable() { status.textContent = 'Download unavailable: source, consent, storage or track is no longer valid.'; }
void run().catch(unavailable);

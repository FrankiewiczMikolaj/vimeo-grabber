import './popup.css';
import type { FrameCandidate, FramePublication } from './detect/frame-state';
import type { DetectionStatus } from './detect/model';
import { audioFor, selection } from './download/select';
import { rightsAcknowledged } from './rights';

type PopupState = { frames: readonly FramePublication[]; results: readonly FrameCandidate[] };
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const refresh = document.querySelector<HTMLButtonElement>('#refresh')!;
const videos = document.querySelector<HTMLElement>('#streams')!;
const jobs = document.createElement('section');
jobs.setAttribute('aria-label', 'Downloads');
videos.before(jobs);
type Job = { tabId: number; status: string; tracks: string[] };
let downloads: Job[] = [];
let tabId: number;
let snapshot: PopupState | null = null;
let polling = false;
let rendered = '';
let acknowledged = false;

const labels: Record<DetectionStatus, string> = {
  pending: 'Looking for download options…',
  found: 'No supported separate downloads are available.',
  unavailable: 'No supported downloads are available.',
  protected: 'Protected (DRM), cannot download.',
  unsupported: 'No supported download format was found.',
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text: string) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}


function render() {
  if (!snapshot) return;
  const next = JSON.stringify([snapshot, acknowledged, downloads]);
  if (next === rendered) return;
  rendered = next;
  const pending = snapshot.frames.some(frame => frame.status === 'pending');
  const failed = snapshot.frames.some(frame => frame.status === 'error');
  const groups = new Map<string, FrameCandidate[]>();
  for (const candidate of snapshot.results) {
    const group = groups.get(candidate.videoId);
    if (group) group.push(candidate);
    else groups.set(candidate.videoId, [candidate]);
  }
  const count = groups.size;
  status.textContent = count
    ? `${count} video${count === 1 ? '' : 's'} detected.${pending ? ' Looking for more download options…' : ''}${failed ? ' Some videos could not be checked.' : ''}`
    : pending ? 'Looking for Vimeo videos…'
      : failed ? 'This page could not be checked. Press Refresh to try again.'
        : 'No Vimeo videos detected. Start the Vimeo player, then press Refresh. Reload existing pages after installing the extension.';
  videos.hidden = !acknowledged;
  jobs.hidden = !acknowledged;
  jobs.replaceChildren(...(acknowledged ? downloads.map(job => {
    const card = document.createElement('article');
    card.append(element('h2', 'Download'), element('p', job.status));
    for (const track of job.tracks) card.append(element('p', track));
    const button = element('button', 'Open download');
    button.onclick = () => { void chrome.tabs.update(job.tabId, { active: true }); window.close(); };
    card.append(button);
    return card;
  }) : []));
  if (!acknowledged) {
    videos.replaceChildren();
    return;
  }
  const rank = (candidate: FrameCandidate) => {
    const paired = candidate.tracks.some(track => track.kind === 'video' && selection(candidate, track.id).length === 2);
    if (paired) return candidate.manifest?.protocol === 'dash' ? 0 : 1;
    if (audioFor(candidate)) return 2;
    return candidate.status === 'found' ? 3 : candidate.status === 'protected' || candidate.accessRefused ? 4 : 5;
  };
  const cards = [...groups.values()].map(alternatives => {
    const direct = new Map<string, { candidate: FrameCandidate; track: FrameCandidate['tracks'][number] }>();
    for (const candidate of alternatives) {
      for (const track of candidate.tracks) {
        if (track.kind === 'combined' && selection(candidate, track.id).length === 1 && !direct.has(track.manifest.url)) {
          direct.set(track.manifest.url, { candidate, track });
        }
      }
    }
    const progressive = [...direct.values()];
    const candidate = alternatives.reduce((best, next) => rank(next) < rank(best) ? next : best);
    const card = document.createElement('article');
    card.append(element('h2', candidate.title?.trim() ? candidate.title : `Vimeo video ${candidate.videoId}`));
    const audio = audioFor(candidate);
    const choices = candidate.tracks.filter(track => track.kind === 'video' && selection(candidate, track.id).length === 2);
    card.append(element('p', progressive.length ? 'Choose an MP4 with video and audio, or a separate download below.' : choices.length
      ? 'Choose a quality to download video and matching audio as separate files.'
      : audio ? 'Audio is available to download.' : candidate.accessRefused
        ? 'Access is restricted or private. Check that you can play this video on the page, then press Refresh.'
        : labels[candidate.status]));
    for (const { candidate: owner, track } of [...progressive,
      ...[...choices, ...(audio ? [audio] : [])].map(track => ({ candidate, track }))]) {
      const button = element('button', track.kind === 'audio' ? 'Audio only' :
        `Download ${track.height ? `${track.height}p` : track.id}${track.kind === 'combined' ?
          ` — MP4 · video + audio — ${track.download.kind === 'file' && track.download.size !== null ?
            `${track.download.size.toLocaleString('en-US')} bytes` : 'size unknown'}` : ''}`);
      button.addEventListener('click', () => {
        button.disabled = true;
        void chrome.runtime.sendMessage({ type: 'download-start', tabId, candidateId: owner.id, trackId: track.id })
          .then(started => { if (!started) status.textContent = 'Download unavailable. Refresh the source and try again.'; })
          .finally(() => { button.disabled = false; });
      });
      card.append(button);
    }
    return card;
  });
  videos.replaceChildren(...cards);
}

async function poll() {
  if (polling || tabId === undefined) return;
  polling = true;
  try {
    const next: PopupState = await chrome.runtime.sendMessage({ type: 'popup-state', tabId });
    const owners = (await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.TAB] }))
      .filter(owner => owner.documentUrl?.startsWith(`${chrome.runtime.getURL('download.html')}#`));
    downloads = (await Promise.all(owners.map(async owner => {
      try {
        const progress = await chrome.runtime.sendMessage({ type: 'download-progress', token: new URL(owner.documentUrl!).hash.slice(1) });
        return progress ? { tabId: owner.tabId, ...progress } as Job : null;
      } catch { return null; }
    }))).filter((job): job is Job => job !== null);
    snapshot = next;
    render();
  } catch {
    snapshot = null;
    rendered = '';
    videos.replaceChildren();
    status.textContent = 'Cannot inspect this page. Press Refresh to try again, or reopen the popup.';
  } finally { polling = false; }
}

refresh.addEventListener('click', async () => {
  if (tabId === undefined) return;
  refresh.disabled = true;
  try {
    await chrome.runtime.sendMessage({ type: 'popup-refresh', tabId });
    await poll();
  } catch {
    status.textContent = 'Cannot refresh this page. Reopen the popup to try again.';
  } finally { refresh.disabled = false; }
});

async function showRightsNotice() {
  const notice = document.querySelector<HTMLElement>('#rights-notice')!;
  const button = document.querySelector<HTMLButtonElement>('#acknowledge')!;
  const message = document.querySelector<HTMLParagraphElement>('#rights-status')!;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await chrome.storage.local.set({ rightsAcknowledged: true });
      if (!await rightsAcknowledged()) throw new Error('Acknowledgement not stored');
      acknowledged = true;
      notice.hidden = true;
      render();
    } catch {
      message.textContent = 'Could not save your acknowledgement. Please try again. The notice will remain until it is saved.';
    } finally {
      button.disabled = false;
    }
  });
  try {
    const stored = await chrome.storage.local.get('rightsAcknowledged');
    acknowledged = stored.rightsAcknowledged === true;
    notice.hidden = acknowledged;
    render();
  } catch {
    message.textContent = 'Could not read your acknowledgement. Please acknowledge to try saving it again.';
  }
}

void showRightsNotice();
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area !== 'local') return;
  acknowledged = false;
  render();
  void rightsAcknowledged().then(value => {
    acknowledged = value;
    document.querySelector<HTMLElement>('#rights-notice')!.hidden = value;
    render();
  });
});

async function start() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) throw new Error('No active tab');
    tabId = tab.id;
    await poll();
    const timer = window.setInterval(() => { void poll(); }, 500);
    window.addEventListener('pagehide', () => { window.clearInterval(timer); }, { once: true });
  } catch {
    status.textContent = 'No active tab is available to inspect.';
  }
}
void start();

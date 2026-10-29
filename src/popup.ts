import './popup.css';
import type { FrameCandidate, FramePublication } from './detect/frame-state';
import type { DetectionStatus } from './detect/model';
import { audioFor, selection } from './download/select';
import { rightsAcknowledged } from './rights';

type PopupState = { frames: readonly FramePublication[]; results: readonly FrameCandidate[]; attemptedOrigins: readonly string[] };
type PermissionState = {
  granted: boolean | null;
  requesting: boolean;
  notice: 'denied' | 'error' | 'revoked' | null;
};
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const videos = document.querySelector<HTMLElement>('#streams')!;
const permissions = new Map<string, PermissionState>();
let tabId: number;
let snapshot: PopupState | null = null;
let polling = false;
let revision = 0;
let rendered = '';
let acknowledged = false;

const labels: Record<DetectionStatus, string> = {
  pending: 'Looking for download options…',
  found: 'No supported separate downloads are available.',
  unavailable: 'No supported downloads are available.',
  'permission-needed': 'Metadata access is needed to inspect qualities.',
  denied: 'Metadata access was denied. Qualities are unavailable.',
  protected: 'Protected (DRM), cannot download.',
  unsupported: 'No supported download format was found.',
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text: string) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

// Permission requests must contain only an exact encountered HTTPS CDN origin.
function cdnOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return value === url.origin && url.protocol === 'https:' && !url.port &&
      (url.hostname === 'vimeocdn.com' || url.hostname.endsWith('.vimeocdn.com'))
      ? url.origin : null;
  } catch { return null; }
}

function manifestOrigin(value: string): string | null {
  try { return cdnOrigin(new URL(value).origin); } catch { return null; }
}

function originsFor(candidate: FrameCandidate): string[] {
  return [...new Set([
    ...candidate.permissionOrigins.map(cdnOrigin),
    candidate.manifest ? manifestOrigin(candidate.manifest.url) : null,
  ].filter((origin): origin is string => origin !== null))];
}

function permissionState(origin: string): PermissionState {
  let state = permissions.get(origin);
  if (!state) {
    state = { granted: null, requesting: false, notice: null };
    permissions.set(origin, state);
  }
  return state;
}

function renderPermission(origin: string, encountered: boolean): HTMLElement {
  const section = document.createElement('div');
  section.className = 'permission';
  const state = permissionState(origin);
  if (state.notice === 'denied') {
    section.append(element('p', `Access to ${origin} was not granted or was denied. Qualities remain unavailable for this origin.`));
  } else if (state.notice === 'error') {
    section.append(element('p', `Access to ${origin} could not be requested. No access was granted.`));
  } else if (state.notice === 'revoked') {
    section.append(element('p', `Metadata access to ${origin} was revoked. Detection is refreshing; earlier metadata may be out of date.`));
  }
  if (!encountered || state.granted === true) return section;
  section.append(element('p', `Allow metadata access to ${origin} to inspect qualities. No media files are fetched.`));
  const button = element('button', state.requesting ? 'Waiting for permission…' : `Allow ${origin}`);
  button.type = 'button';
  button.disabled = state.requesting;
  button.addEventListener('click', () => {
    // Keep the request in this gesture's click stack, without awaiting messaging.
    // Chrome closes the action popup for its native permission dialog.
    void chrome.runtime.sendMessage({ type: 'permission-attempt', tabId, origin });
    let request: Promise<boolean>;
    try {
      request = chrome.permissions.request({ origins: [`${origin}/*`] });
    } catch {
      state.notice = 'error';
      render();
      return;
    }
    state.requesting = true;
    revision++;
    render();
    void request.then(granted => {
      state.granted = granted;
      state.notice = granted ? null : 'denied';
    }, () => {
      state.notice = 'error';
    }).finally(() => {
      state.requesting = false;
      revision++;
      render();
      void refresh();
    });
  });
  section.append(button);
  return section;
}

function render() {
  if (!snapshot) return;
  const next = JSON.stringify([snapshot, [...permissions], acknowledged]);
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
      : failed ? 'This page could not be checked. Reload it to try again.'
        : 'No Vimeo videos detected. Open a Vimeo page or a page with a Vimeo player. Reload existing pages after installing the extension.';
  videos.hidden = !acknowledged;
  if (!acknowledged) {
    videos.replaceChildren();
    return;
  }
  const rank = (candidate: FrameCandidate) => {
    const paired = candidate.tracks.some(track => track.kind === 'video' && selection(candidate, track.id).length === 2);
    if (paired) return candidate.manifest?.protocol === 'dash' ? 0 : 1;
    if (audioFor(candidate)) return 2;
    return candidate.status === 'found' ? 3 : 4;
  };
  const cards = [...groups.values()].map(alternatives => {
    const candidate = alternatives.reduce((best, next) => rank(next) < rank(best) ? next : best);
    const card = document.createElement('article');
    card.append(element('h2', candidate.title?.trim() ? candidate.title : `Vimeo video ${candidate.videoId}`));
    const audio = audioFor(candidate);
    const choices = candidate.tracks.filter(track => track.kind === 'video' && selection(candidate, track.id).length === 2);
    card.append(element('p', choices.length
      ? 'Choose a quality to download video and matching audio as separate files.'
      : audio ? 'Audio is available to download.' : labels[candidate.status]));
    for (const track of [...choices, ...(audio ? [audio] : [])]) {
      const button = element('button', track.kind === 'audio' ? 'Audio only' :
        `Download ${track.height ? `${track.height}p` : track.id}`);
      button.addEventListener('click', () => {
        button.disabled = true;
        void chrome.runtime.sendMessage({ type: 'download-start', tabId, candidateId: candidate.id, trackId: track.id })
          .then(started => { if (!started) status.textContent = 'Download unavailable. Refresh the source and try again.'; })
          .finally(() => { button.disabled = false; });
      });
      card.append(button);
    }
    for (const origin of new Set(alternatives.flatMap(originsFor))) {
      card.append(renderPermission(origin, alternatives.some(other => other.permissionOrigins.includes(origin))));
    }
    return card;
  });
  videos.replaceChildren(...cards);
}

async function poll() {
  if (polling || tabId === undefined) return;
  polling = true;
  const currentRevision = revision;
  try {
    const next: PopupState = await chrome.runtime.sendMessage({ type: 'popup-state', tabId });
    const origins = [...new Set(next.results.flatMap(originsFor))];
    await Promise.all(origins.map(async origin => {
      const granted = await chrome.permissions.contains({ origins: [`${origin}/*`] });
      const state = permissionState(origin);
      if (currentRevision !== revision || state.requesting) return;
      if (state.granted !== null && granted !== state.granted) {
        state.notice = granted ? null : 'revoked';
      }
      state.granted = granted;
      if (!granted && state.notice === null && next.attemptedOrigins.includes(origin)) state.notice = 'denied';
    }));
    if (currentRevision !== revision) return;
    snapshot = next;
    render();
  } catch {
    snapshot = null;
    rendered = '';
    videos.replaceChildren();
    status.textContent = 'Cannot inspect this page. Reload it and reopen the popup to try again.';
  } finally { polling = false; }
}

async function refresh() {
  try { await chrome.runtime.sendMessage({ type: 'refresh', tabId }); } catch { /* Poll reports worker failures. */ }
  await poll();
}

function permissionChanged() {
  revision++;
  void refresh();
}
chrome.permissions.onAdded.addListener(permissionChanged);
chrome.permissions.onRemoved.addListener(permissionChanged);

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

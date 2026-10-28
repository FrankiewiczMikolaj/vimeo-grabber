import './popup.css';
import type { FrameCandidate, FramePublication } from './detect/frame-state';
import type { DetectionStatus, Track } from './detect/model';
import { audioFor, selection } from './download/select';

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

const labels: Record<DetectionStatus, string> = {
  pending: 'Looking for qualities…',
  found: 'Metadata found. This does not confirm playable or downloadable media.',
  unavailable: 'Qualities are unavailable.',
  'permission-needed': 'Metadata access is needed to inspect qualities.',
  denied: 'Metadata access was denied. Qualities are unavailable.',
  protected: 'Protected (DRM), cannot download. No usable tracks are offered.',
  unsupported: 'This metadata format is not supported.',
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

function trackItem(track: Track): HTMLLIElement {
  const item = document.createElement('li');
  const kinds = { video: 'Video', audio: 'Audio', combined: 'Combined video and audio' };
  item.append(element('h3', `${kinds[track.kind]} · ${track.manifest.protocol.toUpperCase()}`));
  const details = document.createElement('dl');
  const fields: [string, string | number | null][] = [
    ['Representation', track.id], ['Audio group', track.groupId],
    ['Codec', track.codec], ['MIME type', track.mimeType],
    ['Bandwidth', track.bandwidth === null ? null : `${track.bandwidth} bit/s`],
    ['Width', track.width === null ? null : `${track.width} px`],
    ['Height', track.height === null ? null : `${track.height} px`],
    ['Frame rate', track.frameRate === null ? null : `${track.frameRate} fps`],
    ['Language', track.language], ['Channels', track.channels],
  ];
  for (const [label, value] of fields) {
    details.append(element('dt', label), element('dd', value === null || value === '' ? 'Unknown' : String(value)));
  }
  item.append(details);
  return item;
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
  const next = JSON.stringify([snapshot, [...permissions]]);
  if (next === rendered) return;
  rendered = next;
  const pending = snapshot.frames.some(frame => frame.status === 'pending');
  const failed = snapshot.frames.some(frame => frame.status === 'error');
  const count = new Set(snapshot.results.map(candidate => candidate.videoId)).size;
  status.textContent = count
    ? `${count} video${count === 1 ? '' : 's'} detected.${pending ? ' Looking for more qualities…' : ''}${failed ? ' Some frames could not be inspected.' : ''}`
    : pending ? 'Looking for Vimeo video metadata…'
      : failed ? 'Some Vimeo frames could not be inspected. Reload the page to try again.'
        : 'No Vimeo videos detected. Open a Vimeo page or a page with a Vimeo player. Reload existing pages after installing the extension.';
  const preferred = new Map<string, string>();
  for (const candidate of snapshot.results) {
    if (candidate.status === 'found' && candidate.manifest?.protocol === 'dash'
      && candidate.tracks.some(track => track.kind === 'video') && candidate.tracks.some(track => track.kind === 'audio')
      && !preferred.has(candidate.videoId)) preferred.set(candidate.videoId, candidate.id);
  }
  const cards = [...snapshot.results].sort((a, b) =>
    Number(preferred.get(b.videoId) === b.id) - Number(preferred.get(a.videoId) === a.id)).map(candidate => {
    const card = document.createElement('article');
    card.append(element('h2', candidate.title?.trim() ? candidate.title : `Vimeo video ${candidate.videoId}`));
    let source = 'Unknown';
    try { source = new URL(candidate.source.frameUrl).hostname; } catch { /* Never render an unparsed URL. */ }
    card.append(element('p', `Source: ${source} · Video ${candidate.videoId}`), element('p', labels[candidate.status]));
    card.append(element('p', candidate.manifest
      ? `${candidate.manifest.protocol.toUpperCase()} · CDN ${candidate.manifest.cdn} · Frame ${candidate.frameId} · ${candidate.source.configUrl ? 'Fetched config' : 'Inline config'}`
      : `Config metadata · Frame ${candidate.frameId}`));
    if (preferred.get(candidate.videoId) === candidate.id) card.append(element('p', 'Preferred: separate DASH video and audio.'));
    const audio = audioFor(candidate);
    const choices = candidate.tracks.filter(track => track.kind === 'video' && selection(candidate, track.id).length === 2);
    if (candidate.manifest?.protocol === 'hls' && choices.length) {
      const protectedDash = snapshot!.results.some(other => other.videoId === candidate.videoId &&
        other.frameId === candidate.frameId && other.manifest?.protocol === 'dash' && other.status === 'protected');
      card.append(element('p', `${protectedDash ? 'DASH is protected. ' : ''}Plain HLS video and matching separate audio are available.`));
    }
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
    for (const origin of originsFor(candidate)) {
      card.append(renderPermission(origin, candidate.permissionOrigins.includes(origin)));
    }
    if (candidate.tracks.length) {
      const tracks = document.createElement('ul');
      tracks.className = 'tracks';
      tracks.setAttribute('aria-label', 'Video and audio qualities');
      tracks.append(...candidate.tracks.map(trackItem));
      card.append(tracks);
    } else {
      card.append(element('p', 'No track metadata available. Unknown qualities are not estimated.'));
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

import { createFrameState, validateFrameDiscovery } from './detect/frame-state';
import type { FrameCandidate } from './detect/frame-state';
import { resolveDiscovery } from './detect/resolve';
import { selection } from './download/select';
import { rightsAcknowledged } from './rights';

const state = createFrameState(chrome.runtime.id, resolveDiscovery);
const connections = new Map<string, chrome.runtime.Port>();
const permissionAttempts = new Map<number, Set<string>>();
const downloads = new Map<string, { candidate: FrameCandidate; trackId: string; owner?: number }>();
function updateBadge(tabId: number) {
  const count = state.videoCount(tabId);
  // A tab can close while a publication is resolving. Its badge no longer exists.
  void chrome.action.setBadgeText({ tabId, text: count ? String(count) : '' }).catch(() => {});
}
void chrome.action.setBadgeBackgroundColor({ color: '#174e6f' });
// Chrome retains action state across worker lifetimes; documents replay live data.
void chrome.tabs.query({}).then(tabs => {
  for (const tab of tabs) if (tab.id !== undefined) updateBadge(tab.id);
});
chrome.tabs.onRemoved.addListener(tabId => {
  for (const [token, intent] of downloads) if (intent.owner === tabId) downloads.delete(token);
});
const empty = { type: 'frame-discovery', discovery: { videos: [], configUrls: [] } };
chrome.runtime.onConnect.addListener(port => {
  const sender = port.sender;
  if (port.name !== 'vimeo-document' || !sender || !validateFrameDiscovery(empty, sender, chrome.runtime.id)) {
    port.disconnect();
    return;
  }
  const tabId = sender.tab!.id!;
  const frameId = sender.frameId!;
  const documentId = sender.documentId!;
  const key = `${tabId}:${frameId}`;
  const previous = connections.get(key);
  connections.set(key, port);
  previous?.disconnect();
  state.activate(tabId, frameId, documentId);
  updateBadge(tabId);
  port.onMessage.addListener(message => {
    if (connections.get(key) !== port) return;
    const publication = state.publish(message, sender);
    updateBadge(tabId);
    void publication.then(() => updateBadge(tabId));
  });
  port.onDisconnect.addListener(() => {
    if (connections.get(key) !== port) return;
    connections.delete(key);
    state.remove(tabId, frameId, documentId);
    updateBadge(tabId);
  });
  port.postMessage({ type: 'report', frameUrl: sender.url });
});
function replay(tabId?: number) {
  for (const port of connections.values()) {
    if (tabId === undefined || port.sender?.tab?.id === tabId) {
      port.postMessage({ type: 'report', frameUrl: port.sender?.url });
    }
  }
}
chrome.permissions.onAdded.addListener(() => replay());
chrome.permissions.onRemoved.addListener(() => replay());
function clearTab(tabId: number) {
  state.clearTab(tabId);
  updateBadge(tabId);
  permissionAttempts.delete(tabId);
  for (const [key, port] of connections) {
    if (port.sender?.tab?.id !== tabId) continue;
    connections.delete(key);
    port.disconnect();
  }
}
chrome.tabs.onRemoved.addListener(clearTab);
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading') clearTab(tabId);
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url !== `${chrome.runtime.getURL('download.html')}#${message?.token}`
    || message?.type !== 'download-source') return;
  void rightsAcknowledged().then(acknowledged => {
    const intent = downloads.get(message.token);
    respond(acknowledged && intent && intent.owner === sender.tab?.id
      ? { candidate: intent.candidate, trackId: intent.trackId } : null);
  });
  return true;
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Only our actual popup may read tab state or request a fresh report.
  if (sender.id !== chrome.runtime.id || sender.tab || sender.url !== chrome.runtime.getURL('popup.html')
    || !message || !Number.isSafeInteger(message.tabId) || message.tabId < 0) return;
  if (message.type === 'popup-state') {
    respond({ frames: state.frames(message.tabId), results: state.candidates(message.tabId),
      attemptedOrigins: [...permissionAttempts.get(message.tabId) ?? []] });
  } else if (message.type === 'download-start') {
    void rightsAcknowledged().then(acknowledged => {
      if (!acknowledged) { respond(false); return; }
      const candidate = state.candidates(message.tabId).find(candidate => candidate.id === message.candidateId);
      if (!candidate || !selection(candidate, message.trackId).length || downloads.size >= 16) { respond(false); return; }
      const token = crypto.randomUUID();
      const intent = { candidate, trackId: message.trackId, owner: undefined as number | undefined };
      downloads.set(token, intent);
      void chrome.tabs.create({ url: `${chrome.runtime.getURL('download.html')}#${token}` }).then(tab => {
        intent.owner = tab.id; respond(true);
      }, () => { downloads.delete(token); respond(false); });
    });
    return true;
  } else if (message.type === 'refresh') {
    replay(message.tabId);
    respond(true);
  } else if (message.type === 'permission-attempt' && typeof message.origin === 'string'
    && state.candidates(message.tabId).some(result => result.permissionOrigins.includes(message.origin))) {
    let attempted = permissionAttempts.get(message.tabId);
    if (!attempted) permissionAttempts.set(message.tabId, attempted = new Set());
    attempted.add(message.origin);
    respond(true);
  }
});

import { createFrameState, validateFrameDiscovery } from './detect/frame-state';
import { resolveDiscovery } from './detect/resolve';
import { selection } from './download/select';

const state = createFrameState(chrome.runtime.id, resolveDiscovery);
const connections = new Map<string, chrome.runtime.Port>();
const permissionAttempts = new Map<number, Set<string>>();
const downloads = new Map<string, { tabId: number; candidateId: string; trackId: string; owner?: number }>();
chrome.tabs.onRemoved.addListener(tabId => {
  for (const [token, intent] of downloads) if (intent.owner === tabId || intent.tabId === tabId) downloads.delete(token);
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
  port.onMessage.addListener(message => {
    if (connections.get(key) === port) void state.publish(message, sender);
  });
  port.onDisconnect.addListener(() => {
    if (connections.get(key) !== port) return;
    connections.delete(key);
    state.remove(tabId, frameId, documentId);
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
  const intent = downloads.get(message.token);
  const candidate = intent && state.candidates(intent.tabId).find(candidate => candidate.id === intent.candidateId);
  respond(intent && candidate && intent.owner === sender.tab?.id ? { candidate, trackId: intent.trackId } : null);
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Only our actual popup may read tab state or request a fresh report.
  if (sender.id !== chrome.runtime.id || sender.tab || sender.url !== chrome.runtime.getURL('popup.html')
    || !message || !Number.isSafeInteger(message.tabId) || message.tabId < 0) return;
  if (message.type === 'popup-state') {
    respond({ frames: state.frames(message.tabId), results: state.candidates(message.tabId),
      attemptedOrigins: [...permissionAttempts.get(message.tabId) ?? []] });
  } else if (message.type === 'download-start') {
    const candidate = state.candidates(message.tabId).find(candidate => candidate.id === message.candidateId);
    if (!candidate || !selection(candidate, message.trackId).length || downloads.size >= 16) { respond(false); return; }
    const token = crypto.randomUUID();
    const intent = { tabId: message.tabId, candidateId: candidate.id, trackId: message.trackId, owner: undefined as number | undefined };
    downloads.set(token, intent);
    void chrome.tabs.create({ url: `${chrome.runtime.getURL('download.html')}#${token}` }).then(tab => {
      intent.owner = tab.id; respond(true);
    }, () => { downloads.delete(token); respond(false); });
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

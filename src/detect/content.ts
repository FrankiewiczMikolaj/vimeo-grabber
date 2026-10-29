import { observePage } from './observe';
import { observeReferences } from './references';

const observe = ['https://vimeo.com', 'https://www.vimeo.com', 'https://player.vimeo.com']
  .includes(window.location.origin) ? observePage : observeReferences;

let observation = observe(window);
let frameUrl = window.location.href;
let port: chrome.runtime.Port | undefined;
let unsubscribe: (() => void) | undefined;
let reconnect: ReturnType<typeof setTimeout> | undefined;
let active = true;
function connect() {
  if (!active) return;
  port = chrome.runtime.connect({ name: 'vimeo-document' });
  const connection = port;
  connection.onMessage.addListener(message => {
    if (message?.type !== 'report' || connection !== port) return;
    unsubscribe?.();
    unsubscribe = observation.subscribe(discovery => connection.postMessage({
      type: 'frame-discovery',
      discovery: { ...discovery, videos: discovery.videos.map(video => ({
        ...video, source: { ...video.source, frameUrl: message.frameUrl },
      })) },
    }));
  });
  connection.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    if (connection !== port) return;
    unsubscribe?.();
    unsubscribe = undefined;
    port = undefined;
    if (active) reconnect = setTimeout(connect, 500);
  });
}
window.addEventListener('pagehide', () => {
  active = false;
  clearTimeout(reconnect);
  unsubscribe?.();
  port?.disconnect();
  port = undefined;
});
window.addEventListener('pageshow', () => {
  active = true;
  if (!port) connect();
});
// Rebuild after same-document navigation. Chrome retains the original document
// URL in sender fields, supplied back in each report request for provenance.
if ('navigation' in window && window.navigation instanceof EventTarget) {
  window.navigation.addEventListener('currententrychange', () => window.setTimeout(() => {
    if (window.location.href === frameUrl) return;
    frameUrl = window.location.href;
    unsubscribe?.();
    observation.stop();
    observation = observe(window);
    port?.disconnect();
    port = undefined;
    clearTimeout(reconnect);
    connect();
  }, 0));
}
connect();

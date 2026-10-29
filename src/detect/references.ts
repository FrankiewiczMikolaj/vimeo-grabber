import { discoverReferences, type PageDiscovery } from './discover';
import type { PageObservation } from './observe';

/** Inspect only iframe/link URLs. Do not inspect third-party scripts or text. */
export function observeReferences(window: Window & typeof globalThis): PageObservation {
  const listeners = new Set<Parameters<PageObservation['subscribe']>[0]>();
  let snapshot = discoverReferences(window.document, window.location.href);
  let previous = JSON.stringify(snapshot);
  let queued = false;
  let stopped = false;
  const scan = () => {
    if (stopped) return;
    const next = discoverReferences(window.document, window.location.href);
    const key = JSON.stringify(next);
    if (key === previous) return;
    snapshot = next;
    previous = key;
    for (const listener of [...listeners]) {
      if (stopped) break;
      if (listeners.has(listener)) listener(snapshot);
    }
  };
  const mutations = new window.MutationObserver(() => {
    if (queued || stopped) return;
    queued = true;
    window.queueMicrotask(() => {
      queued = false;
      scan();
    });
  });
  mutations.observe(window.document, { subtree: true, childList: true,
    attributes: true, attributeFilter: ['src', 'href'] });
  return {
    subscribe(listener) {
      if (stopped) return () => {};
      scan();
      if (stopped) return () => {};
      const report = (value: PageDiscovery) => listener(value);
      listeners.add(report);
      report(snapshot);
      return () => { listeners.delete(report); };
    },
    stop() { stopped = true; mutations.disconnect(); listeners.clear(); },
  };
}

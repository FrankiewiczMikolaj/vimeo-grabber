import { discoverPage, type PageDiscovery } from './discover';

export interface PageObservation {
  subscribe(listener: (snapshot: PageDiscovery) => void): () => void;
  stop(): void;
}

/** Observe one actual Vimeo window. No fetching, polling, or cross-frame wiring. */
export function observePage(window: Window & typeof globalThis): PageObservation {
  if (!['https://vimeo.com', 'https://www.vimeo.com', 'https://player.vimeo.com']
    .includes(window.location.origin)) throw new Error('Unsupported frame origin');

  const document = window.document;
  const resources = new Set<string>();
  const listeners = new Set<(snapshot: PageDiscovery) => void>();
  let stopped = false;
  let queued = false;
  const remember = (entries: PerformanceEntry[]) => {
    for (const entry of entries) {
      if (/^https:\/\/player\.vimeo\.com\/video\/[1-9]\d*\/config(?:[?#]|$)/.test(entry.name)) {
        resources.add(entry.name);
      }
    }
  };
  remember(window.performance.getEntriesByType('resource'));
  let snapshot = discoverPage(document, window.location.href, [...resources]);
  // Alternative order is discovery priority, so it is part of snapshot identity.
  let previous = JSON.stringify(snapshot);
  const schedule = () => {
    if (stopped || queued) return;
    queued = true;
    window.queueMicrotask(() => {
      queued = false;
      if (stopped) return;
      const next = discoverPage(document, window.location.href, [...resources]);
      const nextKey = JSON.stringify(next);
      if (nextKey === previous) return;
      snapshot = next;
      previous = nextKey;
      for (const listener of [...listeners]) {
        if (stopped) break;
        if (listeners.has(listener)) listener(snapshot);
      }
    });
  };
  const mutations = new window.MutationObserver(records => {
    if (records.some(record => {
      const element = record.target.nodeType === 1
        ? record.target as Element : record.target.parentElement;
      if (element?.closest('script, iframe')) return true;
      return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(node =>
        node.nodeType === 1 && ((node as Element).matches('script, iframe')
          || (node as Element).querySelector('script, iframe')));
    })) schedule();
  });
  mutations.observe(document, { subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ['src', 'type'] });
  const performance = new window.PerformanceObserver(list => {
    remember(list.getEntries());
    schedule();
  });
  performance.observe({ type: 'resource', buffered: true });

  return {
    subscribe(listener) {
      if (stopped) return () => {};
      // A subscription owns its registration, even when callbacks are shared.
      const report = (value: PageDiscovery) => listener(value);
      listeners.add(report);
      report(snapshot);
      return () => { listeners.delete(report); };
    },
    stop() {
      stopped = true;
      mutations.disconnect();
      performance.disconnect();
      listeners.clear();
      resources.clear();
    },
  };
}

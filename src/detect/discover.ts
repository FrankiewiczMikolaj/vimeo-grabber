import type { NormalisedVideo } from './model';
import { normalisePlayerConfig } from './normalise';

export interface PageDiscovery {
  readonly videos: readonly NormalisedVideo[];
  readonly configUrls: readonly string[];
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function vimeoUrl(value: string, base: string): URL | null {
  try {
    const url = new URL(value, base);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(url.hostname)
      ? url : null;
  } catch { return null; }
}

function configUrl(value: string, base: string): string | null {
  const url = vimeoUrl(value, base);
  if (!url || url.hostname !== 'player.vimeo.com'
    || !/^\/video\/[1-9]\d*\/config$/.test(url.pathname)) return null;
  url.hash = '';
  return url.href;
}

function fallback(value: string, base: string): string | null {
  const url = vimeoUrl(value, base);
  if (!url) return null;
  const match = url.hostname === 'player.vimeo.com'
    ? /^\/video\/([1-9]\d*)\/?$/.exec(url.pathname)
    : /^\/([1-9]\d*)(?:\/([a-zA-Z0-9]+))?\/?$/.exec(url.pathname);
  if (!match) return null;
  const result = new URL(`https://player.vimeo.com/video/${match[1]}/config${url.search}`);
  if (match[2] && !result.searchParams.has('h')) {
    result.search += `${result.search ? '&' : '?'}h=${encodeURIComponent(match[2])}`;
  }
  return result.href;
}

// Balance JSON objects only. Quotes and escaped backslashes must not close a block.
function jsonObject(text: string, start: number): unknown {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

/** Stateless DOM snapshot; callers own rescans, fetching, and frame aggregation. */
export function discoverPage(
  document: Document, frameUrl: string, observedConfigUrls: readonly string[] = [],
): PageDiscovery {
  const videos: NormalisedVideo[] = [];
  const configUrls = new Set<string>();
  const seenVideos = new Set<string>();
  const addUrl = (value: unknown) => {
    if (typeof value !== 'string') return;
    const url = configUrl(value, frameUrl);
    if (url) configUrls.add(url);
  };
  const accept = (value: unknown) => {
    const video = normalisePlayerConfig(value, { frameUrl, configUrl: null });
    if (video) {
      const key = JSON.stringify(video);
      if (!seenVideos.has(key)) { seenVideos.add(key); videos.push(video); }
    }
    const player = object(object(value)?.player);
    addUrl(player?.config_url);
  };
  for (const script of Array.from(document.querySelectorAll('script'))) {
    const text = script.textContent ?? '';
    if (script.type === 'application/json') {
      try { accept(JSON.parse(text)); } catch { /* Other candidates remain usable. */ }
    } else {
      const assignments = /(?:^|[;\n])\s*(?:(?:var|let|const)\s+playerConfig|(?:window\.)?playerConfig|(?:window\.)?vimeo\.clip_page_config)\s*=\s*(?=\{)/g;
      for (const match of text.matchAll(assignments)) {
        accept(jsonObject(text, match.index + match[0].length));
      }
    }
  }
  for (const url of observedConfigUrls) addUrl(url);
  for (const value of [frameUrl, ...Array.from(document.querySelectorAll('iframe'),
    iframe => iframe.getAttribute('src') ?? '')]) {
    const url = fallback(value, frameUrl);
    if (url) configUrls.add(url);
  }
  return { videos, configUrls: [...configUrls] };
}

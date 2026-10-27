export interface DetectedStream {
  readonly id: string;
  readonly title: string;
  readonly downloadUrl: string;
}

/** Synthetic fixture only. Call in the page context; no network or extension APIs. */
export function detectStreams(page: Pick<Document, 'URL' | 'querySelector'>): DetectedStream[] {
  let config: unknown;
  try {
    const url = new URL(page.URL);
    if (url.protocol !== 'https:' ||
        !['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(url.hostname)) return [];
    const element = page.querySelector('script#synthetic-vimeo-player[type="application/json"]');
    if (!element?.textContent) return [];
    config = JSON.parse(element.textContent);
  } catch {
    return [];
  }
  if (typeof config !== 'object' || config === null ||
      !('version' in config) || config.version !== 1 || !('stream' in config)) return [];
  const stream = config.stream;
  if (typeof stream !== 'object' || stream === null ||
      !('id' in stream) || !('title' in stream) || !('downloadUrl' in stream)) return [];
  const { id, title, downloadUrl } = stream;
  if (!isText(id) || !isText(title) || !isText(downloadUrl)) return [];
  // Only the owned plain-text dummy payload is supported, never executable data.
  const prefix = 'data:text/plain;charset=utf-8,';
  if (!downloadUrl.startsWith(prefix)) return [];
  try {
    if (!decodeURIComponent(downloadUrl.slice(prefix.length)).trim()) return [];
  } catch {
    return [];
  }
  return [{ id, title, downloadUrl }];
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

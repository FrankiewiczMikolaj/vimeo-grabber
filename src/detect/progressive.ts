/** Direct MP4s use the existing Vimeo CDN authority, never the manifest fetch lane. */
export function progressiveUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return value === value.trim() && !value.includes('\\') && url.protocol === 'https:' &&
      !url.username && !url.password && !url.port && !url.hash &&
      (url.hostname === 'vimeocdn.com' || url.hostname.endsWith('.vimeocdn.com') ||
        url.hostname === 'vod-progressive.akamaized.net') &&
      /\.mp4$/.test(url.pathname);
  } catch { return false; }
}

import type { PageDiscovery } from './discover';
import type { ManifestReference, NormalisedVideo, PlaybackCandidate } from './model';
import { MetadataTransport } from './metadata';
import type { InlineMetadata, MetadataResult } from './metadata';
import { normalisePlayerConfig } from './normalise';
import { parseDashJson } from './dash-json';
import { parseDashMpd } from './dash-mpd';
import { hlsProtection, parseHls } from './hls';

/** Caller authenticates the sender and frame URL. No prompts, retries or media fetches. */
export async function resolveDiscovery(
  discovery: PageDiscovery, frameUrl: string,
): Promise<readonly PlaybackCandidate[]> {
  const transport = new MetadataTransport();
  const results = new Map<string, PlaybackCandidate>();
  const candidate = (video: NormalisedVideo, manifest: ManifestReference | null): PlaybackCandidate => ({
    id: JSON.stringify([video.id, video.source.frameUrl, video.source.configUrl, manifest]),
    videoId: video.id, title: video.title, source: video.source, manifest,
    status: video.status === 'protected' || manifest?.protected ||
      (manifest?.protocol === 'hls' && hlsProtection('', [manifest.url]) === 'protected')
      ? 'protected' : 'unavailable', tracks: [], permissionOrigins: [],
  });
  const saveConfig = (video: NormalisedVideo, response?: MetadataResult) => {
    const result = candidate(video, null);
    results.set(result.id, response?.status === 'permission-needed'
      ? { ...result, status: response.status, permissionOrigins: [response.origin] } : result);
  };
  const resolve = async (video: NormalisedVideo, receipt: InlineMetadata | MetadataResult) => {
    if (!video.manifests.length) saveConfig(video);
    for (const reference of video.manifests) {
      const result = candidate(video, reference);
      if (results.has(result.id)) continue;
      if (result.status === 'protected') {
        results.set(result.id, result);
        continue;
      }
      const response = await transport.manifest(receipt, video, reference);
      if (response.status === 'permission-needed') {
        results.set(result.id, { ...result, status: response.status, permissionOrigins: [response.origin] });
        continue;
      }
      if (response.status !== 'fetched') {
        results.set(result.id, result);
        continue;
      }
      let parsed: Pick<PlaybackCandidate, 'status' | 'tracks'>;
      try {
        parsed = reference.protocol === 'hls' ? parseHls(response.text, reference, response.responseUrl)
          : new URL(reference.url).pathname.endsWith('.json')
            ? parseDashJson(JSON.parse(response.text), reference, response.responseUrl)
            : parseDashMpd(response.text, reference, response.responseUrl);
      } catch { parsed = { status: 'unsupported', tracks: [] }; }
      results.set(result.id, { ...result, ...parsed });
    }
  };
  for (const video of discovery.videos) {
    if (video.source.frameUrl !== frameUrl) continue;
    const receipt = transport.inline(video);
    if (receipt) await resolve(receipt.video, receipt);
  }
  for (const configUrl of new Set(discovery.configUrls)) {
    let id: string | undefined;
    try {
      const url = new URL(configUrl);
      if (url.origin === 'https://player.vimeo.com') id = /^\/video\/([1-9]\d*)\/config$/.exec(url.pathname)?.[1];
    } catch { /* Invalid candidates cannot identify a video. */ }
    if (!id) continue;
    const source = { frameUrl, configUrl };
    const response = await transport.config(source);
    const empty: NormalisedVideo = { id, title: null, source, status: 'unavailable', manifests: [], tracks: [] };
    if (response.status === 'fetched') {
      let video: NormalisedVideo | null = null;
      try { video = normalisePlayerConfig(JSON.parse(response.text), source); } catch { /* Other configs remain independent. */ }
      if (video?.id === id) await resolve(video, response);
      else saveConfig(empty);
    } else saveConfig(empty, response);
  }
  return [...results.values()];
}

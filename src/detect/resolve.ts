import type { PageDiscovery } from './discover';
import type { DetectionStatus, NormalisedVideo } from './model';
import { MetadataTransport } from './metadata';
import type { InlineMetadata, MetadataResult } from './metadata';
import { normalisePlayerConfig } from './normalise';
import { parseDashJson } from './dash-json';
import { parseDashMpd } from './dash-mpd';
import { parseHls } from './hls';

interface Resolution {
  readonly video: NormalisedVideo;
  readonly permissionOrigins: readonly string[];
}
const priority: Record<DetectionStatus, number> = {
  pending: 0, unavailable: 1, denied: 2, unsupported: 3,
  'permission-needed': 4, protected: 5, found: 6,
};

/** Caller authenticates the sender and frame URL. No prompts, retries or media fetches. */
export async function resolveDiscovery(
  discovery: PageDiscovery, frameUrl: string,
): Promise<readonly Resolution[]> {
  const transport = new MetadataTransport();
  const results = new Map<string, Resolution>();
  const attempted = new Map<string, Set<string>>();
  const save = (video: NormalisedVideo, origins: readonly string[] = []) => {
    const previous = results.get(video.id);
    results.set(video.id, {
      video: previous && priority[previous.video.status] >= priority[video.status] ? previous.video : video,
      permissionOrigins: [...new Set([...previous?.permissionOrigins ?? [], ...origins])],
    });
  };
  const resolve = async (video: NormalisedVideo, receipt: InlineMetadata | MetadataResult) => {
    if (results.get(video.id)?.video.status === 'found') return;
    save({ ...video, status: 'unavailable', tracks: [] });
    const seen = attempted.get(video.id) ?? new Set<string>();
    attempted.set(video.id, seen);
    for (const reference of video.manifests) {
      const key = JSON.stringify(reference);
      if (seen.has(key)) continue;
      seen.add(key);
      const response = await transport.manifest(receipt, video, reference);
      if (response.status === 'permission-needed') {
        save({ ...video, status: response.status, tracks: [] }, [response.origin]);
        continue;
      }
      if (response.status !== 'fetched') continue;
      let parsed: Pick<NormalisedVideo, 'status' | 'tracks'>;
      try {
        parsed = reference.protocol === 'hls' ? parseHls(response.text, reference)
          : new URL(reference.url).pathname.endsWith('.json')
            ? parseDashJson(JSON.parse(response.text), reference) : parseDashMpd(response.text, reference);
      } catch { parsed = { status: 'unsupported', tracks: [] }; }
      save({ ...video, ...parsed });
      if (parsed.status === 'found') break;
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
    if (!id || results.get(id)?.video.status === 'found') continue;
    const source = { frameUrl, configUrl };
    const response = await transport.config(source);
    const empty: NormalisedVideo = { id, title: null, source, status: 'unavailable', manifests: [], tracks: [] };
    if (response.status === 'permission-needed') {
      save({ ...empty, status: response.status }, [response.origin]);
    } else if (response.status === 'fetched') {
      let video: NormalisedVideo | null = null;
      try { video = normalisePlayerConfig(JSON.parse(response.text), source); } catch { /* Try the next config. */ }
      if (video?.id === id) await resolve(video, response);
      else save(empty);
    } else save(empty);
  }
  return [...results.values()];
}

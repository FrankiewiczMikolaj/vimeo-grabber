export type Protocol = 'dash' | 'hls';
export type DetectionStatus = 'pending' | 'found' | 'unavailable' |
  'protected' | 'unsupported';

export interface DetectionSource {
  readonly frameUrl: string;
  readonly configUrl: string | null;
}

export interface ManifestReference {
  readonly protocol: Protocol;
  readonly cdn: string;
  readonly url: string;
  readonly protected?: true;
}

export interface ProgressiveReference {
  readonly protocol: 'progressive';
  readonly url: string;
  readonly protected?: true;
}

export type DownloadResource =
  | { readonly role: 'initialization'; readonly kind: 'inline-base64'; readonly data: string }
  | { readonly role: 'initialization' | 'media'; readonly kind: 'url'; readonly url: string };

/** Locators only, never grants. Reauthorise every URL and redirect before use. */
export type DownloadReference =
  | { readonly kind: 'playlist'; readonly url: string }
  | { readonly kind: 'file'; readonly url: string; readonly size: number | null }
  | { readonly kind: 'resources'; readonly resources: readonly DownloadResource[] }
  | { readonly kind: 'unavailable'; readonly reason: 'protected' | 'missing-initialization' |
      'unknown' | 'unsafe' | 'unsupported' };

export interface Track {
  readonly id: string;
  readonly groupId: string | null;
  readonly kind: 'video' | 'audio' | 'combined';
  readonly manifest: ManifestReference | ProgressiveReference;
  readonly download: DownloadReference;
  readonly codec: string | null;
  readonly mimeType: string | null;
  readonly bandwidth: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly frameRate: number | null;
  readonly language: string | null;
  readonly channels: string | null;
}

export interface NormalisedVideo {
  readonly id: string;
  readonly title: string | null;
  readonly source: DetectionSource;
  readonly status: DetectionStatus;
  readonly manifests: readonly ManifestReference[];
  readonly tracks: readonly Track[];
}

/** One source-bound metadata alternative. Null manifest records a config-only outcome. */
export interface PlaybackCandidate {
  readonly id: string;
  readonly videoId: string;
  readonly title: string | null;
  readonly source: DetectionSource;
  readonly manifest: ManifestReference | ProgressiveReference | null;
  readonly status: DetectionStatus;
  /** Authoritative invalidation, distinct from missing/failed partial metadata. Worker-local only. */
  readonly invalidation?: 'candidate' | 'source' | 'video';
  /** HTTP access decision: true for 401/403, false for a successfully parsed config. */
  readonly accessRefused?: boolean;
  readonly tracks: readonly Track[];
}

export type Protocol = 'dash' | 'hls';
export type DetectionStatus = 'pending' | 'found' | 'unavailable' |
  'permission-needed' | 'denied' | 'protected' | 'unsupported';

export interface DetectionSource {
  readonly frameUrl: string;
  readonly configUrl: string | null;
}

export interface ManifestReference {
  readonly protocol: Protocol;
  readonly cdn: string;
  readonly url: string;
}

export interface Track {
  readonly id: string;
  readonly groupId: string | null;
  readonly kind: 'video' | 'audio' | 'combined';
  readonly manifest: ManifestReference;
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
  readonly manifest: ManifestReference | null;
  readonly status: DetectionStatus;
  readonly tracks: readonly Track[];
  readonly permissionOrigins: readonly string[];
}

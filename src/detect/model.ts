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

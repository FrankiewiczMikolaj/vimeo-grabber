import type { PlaybackCandidate, Track } from '../detect/model';

const available = (track: Track) => track.download.kind !== 'unavailable';
const sameManifest = (a: Track, b: Track) => JSON.stringify(a.manifest) === JSON.stringify(b.manifest);
const declaredDefault = (track: Track) => 'attributes' in track &&
  (track.attributes as Record<string, string>).DEFAULT === 'YES';

export function audioFor(candidate: PlaybackCandidate, video?: Track): Track | undefined {
  if (candidate.status !== 'found') return;
  return candidate.tracks.filter(track => track.kind === 'audio' && available(track)
    && (!video || (sameManifest(track, video) && (video.manifest.protocol !== 'hls' ||
      (video.groupId !== null && track.groupId === video.groupId)))))
    .sort((a, b) => Number(declaredDefault(b)) - Number(declaredDefault(a)) ||
      (b.bandwidth ?? 0) - (a.bandwidth ?? 0))[0];
}

export function selection(candidate: PlaybackCandidate, trackId: string): readonly Track[] {
  const track = candidate.tracks.find(track => track.id === trackId);
  if (candidate.status !== 'found' || !track || !available(track)) return [];
  if (track.kind === 'audio') return [track];
  const audio = track.kind === 'video' ? audioFor(candidate, track) : undefined;
  return audio ? [track, audio] : [];
}

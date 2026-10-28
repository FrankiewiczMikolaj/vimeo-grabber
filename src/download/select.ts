import type { PlaybackCandidate, Track } from '../detect/model';

const declaredDefault = (track: Track) => 'attributes' in track &&
  (track.attributes as Record<string, string>).DEFAULT === 'YES';

export function audioFor(candidate: PlaybackCandidate, video?: Track): Track | undefined {
  if (candidate.status !== 'found') return;
  return candidate.tracks.filter(track => track.kind === 'audio' && track.download.kind !== 'unavailable'
    && (!track.mimeType || track.mimeType === 'audio/mp4')
    && JSON.stringify(track.manifest) === JSON.stringify(candidate.manifest)
    && (!video || (JSON.stringify(track.manifest) === JSON.stringify(video.manifest) && (video.manifest.protocol !== 'hls' ||
      (video.groupId !== null && track.groupId === video.groupId)))))
    .sort((a, b) => Number(declaredDefault(b)) - Number(declaredDefault(a)) ||
      (b.bandwidth ?? 0) - (a.bandwidth ?? 0))[0];
}

export function selection(candidate: PlaybackCandidate, trackId: string): readonly Track[] {
  const track = candidate.tracks.find(track => track.id === trackId);
  if (candidate.status !== 'found' || !track || track.download.kind === 'unavailable'
    || JSON.stringify(track.manifest) !== JSON.stringify(candidate.manifest)
    || (track.mimeType && track.mimeType !== `${track.kind}/mp4`)) return [];
  if (track.kind === 'audio') return [track];
  const audio = track.kind === 'video' ? audioFor(candidate, track) : undefined;
  return audio ? [track, audio] : [];
}

import type { Track } from '@/types';

export function canonicalRevision(tracks: Track[]): string {
  return tracks.map((track) => track.sourceTrackId || track.videoId).join('|');
}

export function mergeIndependentTracks(
  base: Track[],
  local: Track[],
  remote: Track[],
): { tracks: Track[]; conflict?: { type: string; local: Track[]; remote: Track[] } } {
  const baseIds = new Set(base.map((track) => track.sourceTrackId || track.videoId));
  const localIds = local.map((track) => track.sourceTrackId || track.videoId);
  const remoteIds = remote.map((track) => track.sourceTrackId || track.videoId);
  const localChangedOrder =
    localIds.join('|') !==
    base.map((track) => track.sourceTrackId || track.videoId).join('|');
  const remoteChangedOrder = remoteIds.join('|') !== [...baseIds].join('|');
  if (
    localChangedOrder &&
    remoteChangedOrder &&
    localIds.join('|') !== remoteIds.join('|')
  ) {
    return { tracks: local, conflict: { type: 'reorder', local, remote } };
  }
  const byId = new Map<string, Track>();
  for (const track of [...base, ...remote, ...local]) {
    byId.set(track.sourceTrackId || track.videoId, track);
  }
  const orderedIds = localChangedOrder ? localIds : remoteIds;
  for (const id of remoteIds) if (!orderedIds.includes(id)) orderedIds.push(id);
  for (const id of baseIds) {
    if (!localIds.includes(id) && !remoteIds.includes(id)) byId.delete(id);
  }
  return {
    tracks: orderedIds
      .map((id, position) => ({ ...byId.get(id)!, position }))
      .filter(Boolean),
  };
}

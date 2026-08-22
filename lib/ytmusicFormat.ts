import type { Track } from '@/types';

export function cleanArtistName(artist?: string): string {
  return (artist || '').replace(/\s*-\s*Topic$/i, '').replace(/\s+Topic$/i, '').trim();
}

export function formatDuration(seconds: number): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function getThumbnailUrl(videoId: string, title?: string): string {
  if (!videoId) return '';
  if (title) {
    const slug = title.trim().replace(/[/\\?%*:|"<>]/g, '').replace(/\s+/g, '-').slice(0, 40) || 'track';
    return `/api/thumbnail/${encodeURIComponent(slug)}?v=${encodeURIComponent(videoId)}`;
  }
  return `/api/thumbnail?v=${encodeURIComponent(videoId)}`;
}

/**
 * Get the best available thumbnail URL for a track.
 * Prefers the stored thumbnailUrl (which may be a local API URL after import),
 * then falls back to generating from videoId or sourceTrackId.
 */
export function getTrackThumbnailUrl(track: Pick<Track, 'thumbnailUrl' | 'videoId' | 'title'> & { sourceTrackId?: string }): string {
  if (track.thumbnailUrl) return track.thumbnailUrl;
  const key = track.videoId || track.sourceTrackId || '';
  return getThumbnailUrl(key, track.title);
}

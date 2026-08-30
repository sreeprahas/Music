import type { Track } from '@/types';

export function cleanArtistName(artist?: string): string {
  return (artist || '').replace(/\s*-\s*Topic$/i, '').replace(/\s+Topic$/i, '').trim();
}

export function formatDuration(seconds: number): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Player-safe time formatting.
 *
 * The player UI must NEVER render an empty string, "NaN" or "undefined" for a
 * time value. Whenever the value is missing, not a finite number or negative
 * (no progress loaded, track not loaded yet, invalid metadata, …) this returns
 * the safe "0:00" fallback instead.
 */
export function formatPlayerTime(seconds: unknown, fallback = '0:00'): string {
  const value = typeof seconds === 'number' ? seconds : Number(seconds);
  if (!Number.isFinite(value) || value < 0) return fallback;
  // Floor sub-second precision and guard against float rounding (0.999 → 0).
  const total = Math.floor(value + 1e-6);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export function getThumbnailUrl(videoId: string, title?: string): string {
  if (!videoId) return '';

  if (title) {
    const slug =
      title
        .trim()
        .replace(/[/\\?%*:|"<>]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 40) || 'track';

    return `/api/thumbnail/${encodeURIComponent(slug)}?v=${encodeURIComponent(videoId)}`;
  }

  return `/api/thumbnail?v=${encodeURIComponent(videoId)}`;
}

/**
 * Get the best available thumbnail URL for a track.
 * `refreshKey` changes the URL when a playlist/fullscreen view opens,
 * forcing the renderer to request the current local artwork again.
 */
export function getTrackThumbnailUrl(
  track: Pick<Track, 'thumbnailUrl' | 'videoId' | 'title'> & {
    sourceTrackId?: string;
  },
  refreshKey?: number,
): string {
  const baseUrl =
    track.thumbnailUrl ||
    getThumbnailUrl(
      track.videoId || track.sourceTrackId || '',
      track.title,
    );

  if (!baseUrl || refreshKey === undefined) return baseUrl;

  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}refresh=${refreshKey}`;
}
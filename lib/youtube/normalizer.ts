/**
 * lib/youtube/normalizer.ts
 *
 * Dedicated normalizer converting raw yt-dlp JSON representations
 * into the project's standard Track and Playlist models.
 */

import type { Track, Playlist, YouTubeCandidate } from '@/types';
import { cleanArtistName, getThumbnailUrl } from '@/lib/ytmusicFormat';

export interface RawYtDlpEntry {
  id?: string;
  url?: string;
  webpage_url?: string;
  title?: string;
  description?: string;
  duration?: number | null;
  duration_string?: string | null;
  uploader?: string | null;
  channel?: string | null;
  channel_id?: string | null;
  artists?: string[] | null;
  artist?: string | null;
  album?: string | null;
  thumbnails?: Array<{ url: string; height?: number; width?: number }> | null;
  _type?: string;
  availability?: string | null;
  live_status?: string | null;
}

export interface RawYtDlpPlaylist {
  id?: string;
  title?: string;
  description?: string;
  uploader?: string | null;
  channel?: string | null;
  thumbnails?: Array<{ url: string; height?: number; width?: number }> | null;
  entries?: RawYtDlpEntry[] | null;
  playlist_count?: number | null;
}

/**
 * Checks if a yt-dlp entry represents a playable, valid video.
 */
export function isValidYtDlpEntry(entry: RawYtDlpEntry | null | undefined): boolean {
  if (!entry || typeof entry !== 'object') return false;
  const id = entry.id;
  if (!id || typeof id !== 'string' || id.length !== 11) return false;

  const title = (entry.title || '').trim();
  if (!title) return false;
  if (title === '[Private video]' || title === '[Deleted video]' || title === '[Unavailable video]') {
    return false;
  }

  return true;
}

/**
 * Extracts the best thumbnail URL from an array of thumbnails or generates fallback.
 */
export function extractThumbnailUrl(
  thumbnails?: Array<{ url: string; height?: number; width?: number }> | null,
  videoId?: string,
): string {
  if (Array.isArray(thumbnails) && thumbnails.length > 0) {
    // Pick the highest resolution thumbnail
    const sorted = [...thumbnails].filter((t) => t && typeof t.url === 'string').sort((a, b) => {
      const areaA = (a.width || 0) * (a.height || 0);
      const areaB = (b.width || 0) * (b.height || 0);
      return areaB - areaA;
    });
    if (sorted[0]?.url) return sorted[0].url;
  }

  if (videoId && videoId.length === 11) {
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  }

  return '';
}

/**
 * Extracts a clean artist and title pair from a raw yt-dlp entry.
 */
export function extractArtistAndTitle(entry: RawYtDlpEntry): { title: string; artist: string } {
  let title = (entry.title || '').trim();
  let artist = (entry.artist || entry.channel || entry.uploader || '').trim();

  // If title has "Artist - Title" format
  if (title.includes(' - ')) {
    const parts = title.split(' - ');
    if (parts.length >= 2) {
      const possibleArtist = parts[0].trim();
      const possibleTitle = parts.slice(1).join(' - ').trim();
      const cleanExistingArtist = cleanArtistName(artist).toLowerCase();
      if (
        !artist ||
        artist === 'YouTube' ||
        cleanExistingArtist.includes('topic') ||
        cleanExistingArtist === possibleArtist.toLowerCase()
      ) {
        artist = possibleArtist;
        title = possibleTitle;
      }
    }
  }

  // Remove trailing (Official Video), [Official Audio], etc.
  title = title
    .replace(/\s*[\(\[](?:Official\s+(?:Music\s+)?(?:Video|Audio|HD|4K|Visualizer|Lyric\s+Video)|Lyrics|Audio|Video|Official)[\)\]]/gi, '')
    .trim();

  artist = cleanArtistName(artist) || 'Unknown Artist';
  return { title: title || entry.title || 'Untitled Track', artist };
}

/**
 * Normalizes a raw yt-dlp entry into a project Track model.
 */
export function normalizeYtDlpTrack(
  entry: RawYtDlpEntry,
  position = 0,
  playlistId?: string,
): Track | null {
  if (!isValidYtDlpEntry(entry)) return null;

  const videoId = entry.id!;
  const { title, artist } = extractArtistAndTitle(entry);
  const thumbnailUrl = extractThumbnailUrl(entry.thumbnails, videoId) || getThumbnailUrl(videoId, title);
  const duration = typeof entry.duration === 'number' && entry.duration > 0
    ? Math.round(entry.duration)
    : undefined;

  return {
    videoId,
    title,
    artist,
    album: entry.album || undefined,
    thumbnailUrl,
    duration,
    position,
    playlistId,
    source: 'youtube',
    sourceTrackId: videoId,
    dateAdded: new Date().toISOString(),
  };
}

/**
 * Normalizes a raw yt-dlp entry into a matching candidate.
 */
export function normalizeYtDlpCandidate(
  entry: RawYtDlpEntry,
): YouTubeCandidate | null {
  if (!isValidYtDlpEntry(entry)) return null;

  const videoId = entry.id!;
  const { title, artist } = extractArtistAndTitle(entry);
  const duration = typeof entry.duration === 'number' && entry.duration > 0
    ? Math.round(entry.duration)
    : undefined;
  const thumbnails = entry.thumbnails?.map((t) => t.url).filter(Boolean) || [
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  ];

  return {
    videoId,
    title,
    channel: artist,
    artist,
    album: entry.album || undefined,
    duration,
    thumbnails,
  };
}

/**
 * Normalizes a raw yt-dlp playlist structure into a Playlist and Track array.
 */
export function normalizeYtDlpPlaylist(
  raw: RawYtDlpPlaylist,
  playlistUrl?: string,
): { playlist: Playlist; tracks: Track[] } {
  const playlistId = raw.id || 'unknown';
  const localId = `local-yt-${playlistId}-${Date.now().toString(36)}`;
  const title = (raw.title || 'YouTube Playlist').trim();
  const description = (raw.description || '').trim();

  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  const tracks: Track[] = [];

  for (let i = 0; i < entries.length; i++) {
    const track = normalizeYtDlpTrack(entries[i], tracks.length, localId);
    if (track) {
      tracks.push(track);
    }
  }

  const coverUrl = extractThumbnailUrl(raw.thumbnails) || (tracks[0]?.thumbnailUrl || '');
  const now = new Date().toISOString();

  const playlist: Playlist = {
    id: localId,
    title,
    description,
    thumbnailUrl: coverUrl,
    trackCount: tracks.length,
    source: 'youtube',
    sourceUrl: playlistUrl || `https://www.youtube.com/playlist?list=${playlistId}`,
    sourcePlaylistId: playlistId,
    createdAt: now,
    importedAt: now,
    lastSyncedAt: now,
    syncStatus: 'idle',
  };

  return { playlist, tracks };
}

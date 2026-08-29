/**
 * lib/youtube/playlist.ts
 *
 * YouTube and YouTube Music playlist metadata preview and import service.
 * Preview is strictly non-destructive.
 * Import commits authoritative data to SQLite via reconcilePlaylist().
 */

import { execYtDlp, YtDlpError } from './ytdlp';
import { extractYouTubePlaylistId } from './validation';
import { normalizeYtDlpPlaylist, type RawYtDlpPlaylist } from './normalizer';
import { reconcilePlaylist } from '@/lib/storage/playlists';
import type { Playlist, Track } from '@/types';

export interface YouTubePlaylistPreviewTrack {
  title: string;
  artist: string;
  duration?: number;
  videoId: string;
  thumbnailUrl: string;
}

export interface YouTubePlaylistPreview {
  title: string;
  coverUrl?: string;
  description?: string;
  totalTracks: number;
  tracks: YouTubePlaylistPreviewTrack[];
  isPublic: boolean;
  source: 'youtube';
  sourcePlaylistId: string;
}

export interface PreviewOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Fetches raw playlist metadata via yt-dlp.
 */
async function fetchRawPlaylistData(
  playlistId: string,
  options: PreviewOptions = {},
): Promise<RawYtDlpPlaylist> {
  const url = `https://www.youtube.com/playlist?list=${playlistId}`;
  const args = [
    '--dump-single-json',
    '--flat-playlist',
    url,
    '--no-warnings',
    '--skip-download',
    '--ignore-errors',
  ];

  const result = await execYtDlp({
    args,
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? 30_000,
  });

  const rawJson = result.stdout.trim();
  if (!rawJson) {
    throw new YtDlpError('No metadata received from YouTube for playlist');
  }

  try {
    return JSON.parse(rawJson) as RawYtDlpPlaylist;
  } catch (err) {
    throw new YtDlpError('Failed to parse YouTube playlist metadata');
  }
}

/**
 * Non-destructively previews a YouTube / YouTube Music playlist.
 * Zero modifications to SQLite.
 */
export async function previewYouTubePlaylist(
  urlOrId: string,
  options: PreviewOptions = {},
): Promise<YouTubePlaylistPreview> {
  const playlistId = extractYouTubePlaylistId(urlOrId);
  if (!playlistId) {
    throw new Error('Invalid YouTube playlist URL or ID');
  }

  const raw = await fetchRawPlaylistData(playlistId, options);
  const normalized = normalizeYtDlpPlaylist(raw, `https://www.youtube.com/playlist?list=${playlistId}`);

  if (normalized.tracks.length === 0) {
    throw new Error('Playlist does not exist or contains no playable videos');
  }

  return {
    title: normalized.playlist.title,
    coverUrl: normalized.playlist.thumbnailUrl || undefined,
    description: normalized.playlist.description || undefined,
    totalTracks: normalized.tracks.length,
    tracks: normalized.tracks.map((t) => ({
      title: t.title,
      artist: t.artist,
      duration: t.duration,
      videoId: t.videoId,
      thumbnailUrl: t.thumbnailUrl,
    })),
    isPublic: true,
    source: 'youtube',
    sourcePlaylistId: playlistId,
  };
}

/**
 * Authoritatively imports a YouTube / YouTube Music playlist into local SQLite.
 */
export async function importYouTubePlaylist(
  urlOrId: string,
  customTitle?: string,
): Promise<{ playlist: Playlist; tracks: Track[] }> {
  const playlistId = extractYouTubePlaylistId(urlOrId);
  if (!playlistId) {
    throw new Error('Invalid YouTube playlist URL or ID');
  }

  const raw = await fetchRawPlaylistData(playlistId);
  const { playlist: initialPlaylist, tracks: rawTracks } = normalizeYtDlpPlaylist(
    raw,
    `https://www.youtube.com/playlist?list=${playlistId}`,
  );

  if (rawTracks.length === 0) {
    throw new Error('No playable tracks were found in that playlist');
  }

  const trimmedTitle = customTitle?.trim();
  if (trimmedTitle) {
    initialPlaylist.title = trimmedTitle;
  }

  // Reconcile and commit to SQLite
  const { playlist, tracks } = await reconcilePlaylist(
    initialPlaylist,
    rawTracks,
    initialPlaylist.thumbnailUrl || undefined,
  );

  return { playlist, tracks };
}

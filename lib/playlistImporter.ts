/**
 * lib/playlistImporter.ts
 *
 * Unified playlist preview and import coordinator for Spotify metadata and legacy YouTube playlists.
 */

import type { Playlist, Track } from '@/types';
import { fetchEmbedPreview } from './spotify/embed';
import { toAppTrack, toAppPlaylist } from './spotify/normalize';
import { MusicService } from './music/spotiflac';
import { extractPlaylistId, isSpotifyPlaylistUrl } from './spotify/validation';
import { previewYouTubePlaylist, importYouTubePlaylist } from './youtube/playlist';
import { isYouTubePlaylistUrl, isYouTubeUrl } from './youtube/validation';

export interface PlaylistPreviewTrack {
  title: string;
  artist: string;
  duration?: number;
  videoId?: string;
  thumbnailUrl?: string;
}

export interface PlaylistPreviewResult {
  title: string;
  coverUrl?: string;
  description?: string;
  tracks: PlaylistPreviewTrack[];
  totalTracks: number;
  isPublic: boolean;
  source: 'spotify' | 'youtube';
}

// ─── Preview ──────────────────────────────────────────────────────────────────

export async function previewPlaylistUrl(rawUrl: string): Promise<PlaylistPreviewResult> {
  if (typeof rawUrl !== 'string' || rawUrl.length > 2000) {
    throw new Error('Playlist URL is invalid');
  }

  if (isSpotifyPlaylistUrl(rawUrl)) {
    const id = extractPlaylistId(rawUrl);
    if (!id) throw new Error('Could not extract a Spotify playlist id from that URL');
    const embed = await fetchEmbedPreview(id);
    return {
      title: embed.playlistName,
      coverUrl: embed.coverImage || undefined,
      isPublic: true,
      totalTracks: embed.totalTracks,
      tracks: embed.tracks.map((t) => ({
        title: t.name,
        artist: t.artists,
        duration: t.duration_ms ? Math.round(t.duration_ms / 1000) : undefined,
        thumbnailUrl: t.image || undefined,
      })),
      source: 'spotify',
    };
  }

  if (isYouTubePlaylistUrl(rawUrl) || isYouTubeUrl(rawUrl)) {
    const ytPreview = await previewYouTubePlaylist(rawUrl);
    return {
      title: ytPreview.title,
      coverUrl: ytPreview.coverUrl,
      description: ytPreview.description,
      tracks: ytPreview.tracks,
      totalTracks: ytPreview.totalTracks,
      isPublic: ytPreview.isPublic,
      source: 'youtube',
    };
  }

  throw new Error('A Spotify playlist URL is required');
}

// ─── Import ───────────────────────────────────────────────────────────────────

export async function importPlaylistUrl(
  rawUrl: string,
  customTitle?: string,
): Promise<{ playlist: Playlist; tracks: Track[] }> {
  if (typeof rawUrl !== 'string' || rawUrl.length > 2000) {
    throw new Error('Playlist URL is invalid');
  }

  if (isSpotifyPlaylistUrl(rawUrl)) {
    return importSpotify(rawUrl, customTitle);
  }

  if (isYouTubePlaylistUrl(rawUrl) || isYouTubeUrl(rawUrl)) {
    return importYouTubePlaylist(rawUrl, customTitle);
  }

  throw new Error('A Spotify playlist URL is required');
}

// ─── Spotify import helper ────────────────────────────────────────────────────

async function importSpotify(
  rawUrl: string,
  customTitle?: string,
): Promise<{ playlist: Playlist; tracks: Track[] }> {
  const id = extractPlaylistId(rawUrl);
  if (!id) throw new Error('Could not extract a Spotify playlist id from that URL');

  const resolvedTracks = await MusicService.resolve(rawUrl);
  const embed = await fetchEmbedPreview(id).catch(() => null);
  const playlistName = customTitle?.trim() || embed?.playlistName?.trim() || 'Spotify Playlist';

  const localId = `sp-${id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const normalizedTracks = resolvedTracks.map((track) => ({
    name: track.title,
    artists: track.artists.join(', '),
    duration_ms: track.duration * 1000,
    image: track.artwork || '',
    added_at: new Date().toISOString(),
    spotifyTrackId: track.spotifyId,
    album: track.album,
  }));
  const appTracks = normalizedTracks.map((t, i) => toAppTrack(t, i, localId));
  const playlist = {
    ...toAppPlaylist(id, playlistName, embed?.coverImage || appTracks[0]?.thumbnailUrl || '', rawUrl, appTracks),
    id: localId,
  };

  return { playlist, tracks: appTracks };
}

/**
 * Playlist importer — coordinates preview and import for Spotify and YouTube URLs.
 *
 * Spotify flow:
 *   Preview — fetchEmbedPreview (scrapes artwork, caches metadata + images in preview cache)
 *   Import  — guest-token + internal API, promotes preview cache to real data, downloads all track artwork
 *
 * YouTube flow: unchanged.
 */

import type { Playlist, Track } from '@/types';
import { getThumbnailUrl } from './ytmusicFormat';
import { getAllYouTubePlaylistTracks } from './youtube/playlists';
import { fetchEmbedPreview } from './spotify/embed';
import { fetchGuestToken } from './spotify/guestToken';
import { fetchAllPlaylistTracks, fetchPlaylistMeta } from './spotify/apiClient';
import { toAppTrack, toAppPlaylist } from './spotify/normalize';
import { extractPlaylistId, isSpotifyPlaylistUrl } from './spotify/validation';
import { promotePreviewToRealData } from './spotify/previewCache';
import { downloadAllTrackThumbnails } from './db';

export interface PlaylistPreviewTrack {
  title: string;
  artist: string;
  duration?: number;
  videoId?: string;
  thumbnailUrl?: string;
}

// ─── Preview ──────────────────────────────────────────────────────────────────

export async function previewPlaylistUrl(rawUrl: string): Promise<{
  title: string;
  coverUrl?: string;
  tracks: PlaylistPreviewTrack[];
  isPublic: boolean;
}> {
  if (typeof rawUrl !== 'string' || rawUrl.length > 2000) throw new Error('Playlist URL is invalid');

  if (isSpotifyPlaylistUrl(rawUrl)) {
    const id = extractPlaylistId(rawUrl);
    if (!id) throw new Error('Could not extract a Spotify playlist id from that URL');
    const embed = await fetchEmbedPreview(id);
    return {
      title: embed.playlistName,
      coverUrl: embed.coverImage || undefined,
      isPublic: true,
      tracks: embed.tracks.map((t) => ({
        title: t.name,
        artist: t.artists,
        duration: t.duration_ms ? Math.round(t.duration_ms / 1000) : undefined,
        thumbnailUrl: t.image || undefined,
      })),
    };
  }

  const url = parseUrl(rawUrl);
  if (!isYouTubeUrl(url)) throw new Error('Only public YouTube and Spotify playlist URLs are supported');
  const id = extractYouTubePlaylistId(url);
  if (!id) throw new Error('Could not extract a YouTube playlist id from that URL');
  const imported = await getAllYouTubePlaylistTracks(id);
  return {
    title: imported.title || 'YouTube playlist',
    coverUrl: imported.items[0]?.videoId
      ? getThumbnailUrl(imported.items[0].videoId, imported.items[0].title)
      : undefined,
    isPublic: true,
    tracks: imported.items.map((item) => ({
      title: item.title,
      artist: item.channel || 'Unknown artist',
      duration: item.duration,
      videoId: item.videoId,
      thumbnailUrl: getThumbnailUrl(item.videoId, item.title),
    })),
  };
}

// ─── Import ───────────────────────────────────────────────────────────────────

export async function importPlaylistUrl(rawUrl: string): Promise<{ playlist: Playlist; tracks: Track[] }> {
  if (typeof rawUrl !== 'string' || rawUrl.length > 2000) throw new Error('Playlist URL is invalid');
  if (isSpotifyPlaylistUrl(rawUrl)) return importSpotify(rawUrl);
  const url = parseUrl(rawUrl);
  if (!isYouTubeUrl(url)) throw new Error('Only public YouTube and Spotify playlist URLs are supported');
  const id = extractYouTubePlaylistId(url);
  if (!id) throw new Error('Could not extract a YouTube playlist id from that URL');
  const imported = await getAllYouTubePlaylistTracks(id);
  if (!imported.items.length) throw new Error('No playable tracks were found in that playlist URL');
  const now = new Date().toISOString();
  const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tracks = imported.items.map((item, position) => ({
    videoId: item.videoId,
    playlistItemId: item.playlistItemId,
    title: item.title,
    artist: item.channel || 'Unknown artist',
    thumbnailUrl: getThumbnailUrl(item.videoId, item.title),
    duration: item.duration,
    position,
    playlistId: localId,
    source: 'youtube' as const,
    sourceTrackId: item.videoId,
    dateAdded: now,
  }));
  return {
    playlist: {
      id: localId,
      title: imported.title || 'Imported playlist',
      description: 'Imported from YouTube',
      thumbnailUrl: tracks[0]?.thumbnailUrl || '',
      trackCount: tracks.length,
      importedAt: now,
      createdAt: now,
      sourceUrl: rawUrl,
      source: 'youtube',
      sourcePlaylistId: id,
      sourceRevision: revision(tracks),
    },
    tracks,
  };
}

// ─── Spotify import (full, paginated) ────────────────────────────────────────

async function importSpotify(rawUrl: string): Promise<{ playlist: Playlist; tracks: Track[] }> {
  const id = extractPlaylistId(rawUrl);
  if (!id) throw new Error('Could not extract a Spotify playlist id from that URL');

  const { accessToken } = await fetchGuestToken(id);

  const [meta, rawTracks] = await Promise.all([
    fetchPlaylistMeta(id, accessToken),
    fetchAllPlaylistTracks(id, accessToken),
  ]);

  const localId = `spotify-${id}`;
  const appTracks = rawTracks.map((t, i) => toAppTrack(t, i, localId));
  const playlist = toAppPlaylist(id, meta.name, meta.image, rawUrl, appTracks);

  // 1. Promote cached preview images to real thumbnails
  await promotePreviewToRealData(id, appTracks).catch(() => {});

  // 2. Download artwork for all tracks and convert to WebP
  const tracksWithLocalThumbs = await downloadAllTrackThumbnails(appTracks);

  return { playlist, tracks: tracksWithLocalThumbs };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseUrl(rawUrl: string): URL {
  try {
    return new URL(rawUrl);
  } catch {
    throw new Error('Playlist URL is invalid');
  }
}

function isYouTubeUrl(url: URL): boolean {
  return (
    url.protocol === 'https:' &&
    ['youtube.com', 'www.youtube.com', 'music.youtube.com', 'youtu.be'].includes(url.hostname)
  );
}

function extractYouTubePlaylistId(url: URL): string | null {
  return url.searchParams.get('list') || null;
}

function revision(tracks: Track[]): string {
  return tracks.map((t) => t.sourceTrackId || t.videoId).join('|');
}

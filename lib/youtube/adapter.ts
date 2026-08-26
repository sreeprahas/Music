/**
 * lib/youtube/adapter.ts
 *
 * Normalization boundary: transforms raw ytmusicapi sidecar responses
 * into strict domain models (Track, Playlist, YouTubeCandidate).
 */

import type { Track, Playlist } from '@/types';
import type { YouTubeCandidate, YouTubePlaylistDetails, YouTubeUserPlaylist } from './types';
import { getThumbnailUrl } from '@/lib/ytmusicFormat';

export function parseDurationToSeconds(durationStr?: string | number): number | undefined {
  if (typeof durationStr === 'number' && Number.isFinite(durationStr)) {
    return durationStr;
  }
  if (!durationStr || typeof durationStr !== 'string') return undefined;

  const parts = durationStr.split(':').map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return undefined;

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return undefined;
}

export function extractThumbnails(thumbnails: any): string[] {
  if (!thumbnails) return [];
  if (Array.isArray(thumbnails)) {
    return thumbnails
      .map((item) => (typeof item === 'string' ? item : item?.url))
      .filter((url): url is string => Boolean(url && typeof url === 'string'));
  }
  if (typeof thumbnails === 'string') return [thumbnails];
  if (typeof thumbnails === 'object' && thumbnails.url) return [String(thumbnails.url)];
  return [];
}

export function extractPrimaryArtist(artists: any): { name: string; id?: string } {
  if (!artists) return { name: 'Unknown artist' };
  if (typeof artists === 'string') return { name: artists.trim() };
  if (Array.isArray(artists) && artists.length > 0) {
    const first = artists[0];
    if (typeof first === 'string') return { name: first.trim() };
    if (first && typeof first === 'object') {
      return {
        name: String(first.name || 'Unknown artist').trim(),
        id: first.id ? String(first.id) : undefined,
      };
    }
  }
  if (typeof artists === 'object') {
    return {
      name: String(artists.name || 'Unknown artist').trim(),
      id: artists.id ? String(artists.id) : undefined,
    };
  }
  return { name: 'Unknown artist' };
}

export function extractAllArtistNames(artists: any): string {
  if (!artists) return 'Unknown artist';
  if (typeof artists === 'string') return artists.trim();
  if (Array.isArray(artists)) {
    const names = artists
      .map((a) => (typeof a === 'string' ? a : a?.name))
      .filter((n): n is string => Boolean(n));
    return names.length > 0 ? names.join(', ') : 'Unknown artist';
  }
  if (typeof artists === 'object' && artists.name) return String(artists.name);
  return 'Unknown artist';
}

export function extractAlbum(album: any): { name?: string; id?: string } {
  if (!album) return {};
  if (typeof album === 'string') return { name: album.trim() };
  if (typeof album === 'object') {
    return {
      name: album.name ? String(album.name).trim() : undefined,
      id: album.id ? String(album.id) : undefined,
    };
  }
  return {};
}

export function toYouTubeCandidate(raw: any, index = 0): YouTubeCandidate | null {
  if (!raw || typeof raw !== 'object') return null;

  const videoId = String(raw.videoId || raw.id || raw.video?.id || '').trim();
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return null;
  }

  const title = String(raw.title || raw.name || raw.video?.title || 'Unknown Title').trim();
  const primaryArtist = extractPrimaryArtist(raw.artists || raw.channel || raw.artist || raw.author);
  const allArtists = extractAllArtistNames(raw.artists || raw.channel || raw.artist || raw.author);
  const albumInfo = extractAlbum(raw.album);
  const duration = raw.duration_seconds !== undefined
    ? Number(raw.duration_seconds)
    : parseDurationToSeconds(raw.duration || raw.lengthSeconds || raw.durationSeconds);

  const thumbnails = extractThumbnails(raw.thumbnails || raw.thumbnail);

  return {
    videoId,
    playlistItemId: raw.playlistItemId ? String(raw.playlistItemId) : undefined,
    title,
    channel: allArtists || primaryArtist.name,
    artistId: primaryArtist.id,
    album: albumInfo.name,
    albumId: albumInfo.id,
    duration,
    durationSeconds: duration,
    thumbnails,
    isExplicit: Boolean(raw.isExplicit),
    year: raw.year,
    relevance: index,
    resultType: raw.resultType,
    category: raw.category,
  };
}

export function candidateToTrack(candidate: YouTubeCandidate, position = 0): Track {
  const thumbnail = candidate.thumbnails && candidate.thumbnails.length > 0
    ? candidate.thumbnails[candidate.thumbnails.length - 1]
    : getThumbnailUrl(candidate.videoId, candidate.title);

  return {
    videoId: candidate.videoId,
    title: candidate.title,
    artist: candidate.channel || 'Unknown artist',
    album: candidate.album,
    thumbnailUrl: thumbnail,
    duration: candidate.duration,
    position,
    playlistItemId: candidate.playlistItemId,
    source: 'youtube',
  };
}

export function toAppPlaylist(userPlaylist: YouTubeUserPlaylist): Playlist {
  const id = `yt-${userPlaylist.playlistId}`;
  const thumbnail = userPlaylist.thumbnails && userPlaylist.thumbnails.length > 0
    ? userPlaylist.thumbnails[userPlaylist.thumbnails.length - 1]
    : '';

  return {
    id,
    title: userPlaylist.title || 'Untitled YouTube Playlist',
    description: userPlaylist.description || '',
    thumbnailUrl: thumbnail,
    thumbnailUrls: userPlaylist.thumbnails,
    trackCount: userPlaylist.count || 0,
    source: 'youtube',
    sourcePlaylistId: userPlaylist.playlistId,
    sourceUrl: `https://music.youtube.com/playlist?list=${userPlaylist.playlistId}`,
    syncStatus: 'idle',
  };
}

export function toPlaylistDetails(rawPlaylist: any): YouTubePlaylistDetails {
  const id = String(rawPlaylist.id || rawPlaylist.playlistId || '');
  const title = String(rawPlaylist.title || 'Untitled Playlist');
  const description = rawPlaylist.description ? String(rawPlaylist.description) : undefined;
  const author = rawPlaylist.author ? { name: String(rawPlaylist.author.name || rawPlaylist.author), id: rawPlaylist.author.id } : undefined;
  const thumbnails = extractThumbnails(rawPlaylist.thumbnails || rawPlaylist.thumbnail);
  const rawTracks = Array.isArray(rawPlaylist.tracks) ? rawPlaylist.tracks : [];

  const tracks: YouTubeCandidate[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < rawTracks.length; i++) {
    const candidate = toYouTubeCandidate(rawTracks[i], i);
    if (candidate && !seenIds.has(candidate.videoId)) {
      seenIds.add(candidate.videoId);
      tracks.push(candidate);
    }
  }

  return {
    id,
    title,
    description,
    author,
    thumbnails,
    trackCount: rawPlaylist.trackCount || tracks.length,
    tracks,
    continuation: rawPlaylist.continuation,
  };
}

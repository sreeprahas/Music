import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import type { Playlist, Track } from '@/types';
import { cleanArtistName } from './ytmusicApi';
import { getDataDir } from './nativeData';

const croppedPlaylistIds = new Set<string>();
const croppedTrackIds = new Set<string>();

function getPaths() {
const DATA_DIR = path.resolve(getDataDir());
  return {
    DATA_DIR,
    METADATA_PATH: path.join(DATA_DIR, 'metadata_cache.json'),
    LYRICS_DIR: path.join(DATA_DIR, 'lyrics'),
    THUMBNAILS_DIR: path.join(DATA_DIR, 'thumbnails'),
    PLAYLIST_THUMBNAILS_DIR: path.join(DATA_DIR, 'playlist-thumbnails'),
  };
}

export function ensureDirs() {
  const { DATA_DIR, LYRICS_DIR, THUMBNAILS_DIR, PLAYLIST_THUMBNAILS_DIR } = getPaths();
  [DATA_DIR, LYRICS_DIR, THUMBNAILS_DIR, PLAYLIST_THUMBNAILS_DIR].forEach((d) => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

export interface UserSettings {
  hiddenPlaylists: string[];
  pinnedPlaylists: string[];
  playlistOrder: string[];
  volume: number;
  isMuted: boolean;
  isShuffle: boolean;
  repeatMode: string;
  queueWidth?: number;
  lyricsWidth?: number;
  playbackSession?: {
    track: Track | null;
    queue: Track[];
    time: number;
    volume: number;
    isMuted: boolean;
    isShuffle: boolean;
    repeatMode: string;
    isQueueOpen: boolean;
    isLyricsOpen: boolean;
  } | null;
}

interface MetadataCache {
  playlists: Playlist[];
  playlistTracks: Record<string, Track[]>;
  userSettings?: Record<string, UserSettings>;
  lastUpdated: number;
}

const DEFAULT_SETTINGS: UserSettings = {
  hiddenPlaylists: [],
  pinnedPlaylists: [],
  playlistOrder: [],
  volume: 1,
  isMuted: false,
  isShuffle: false,
  repeatMode: 'off',
  playbackSession: null,
};

function getCache(): MetadataCache {
  ensureDirs();
  const { METADATA_PATH } = getPaths();
  if (!fs.existsSync(METADATA_PATH)) {
    return { playlists: [], playlistTracks: {}, userSettings: {}, lastUpdated: 0 };
  }
  try {
    const data = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf-8'));
    if (!data.userSettings) data.userSettings = {};
    return data;
  } catch {
    return { playlists: [], playlistTracks: {}, userSettings: {}, lastUpdated: 0 };
  }
}

export function getUserSettings(email: string): UserSettings {
  const cache = getCache();
  const key = email.toLowerCase().trim();
  return { ...DEFAULT_SETTINGS, ...(cache.userSettings?.[key] || {}) };
}

export function saveUserSettings(email: string, settings: Partial<UserSettings>): UserSettings {
  const cache = getCache();
  const key = email.toLowerCase().trim();
  if (!cache.userSettings) cache.userSettings = {};
  const current = getUserSettings(key);
  const updated: UserSettings = {
    ...current,
    ...settings,
  };
  cache.userSettings[key] = updated;
  saveCache(cache);
  return updated;
}

function saveCache(cache: MetadataCache) {
  ensureDirs();
  const { METADATA_PATH } = getPaths();
  fs.writeFileSync(METADATA_PATH, JSON.stringify(cache, null, 2));
}

export function getCachedPlaylists(): Playlist[] {
  return getCache().playlists;
}

export function setCachedPlaylists(playlists: Playlist[]) {
  const cache = getCache();
  // Remove stale artwork when the upstream source changes (for example when
  // replacing a first-track thumbnail with YouTube Music's playlist artwork).
  for (const playlist of playlists) {
    const previous = cache.playlists.find((item) => item.id === playlist.id);
    if (previous && previous.thumbnailUrl !== playlist.thumbnailUrl) {
      try { fs.unlinkSync(getLocalPlaylistThumbnailPath(playlist.id)); } catch { /* already absent */ }
    }
  }
  cache.playlists = playlists;
  cache.lastUpdated = Date.now();
  saveCache(cache);
  void prefetchPlaylistThumbnails(playlists);
}

export function deleteCachedPlaylist(playlistId: string) {
  const cache = getCache();
  cache.playlists = cache.playlists.filter((p) => p.id !== playlistId);
  delete cache.playlistTracks[playlistId];
  cache.lastUpdated = Date.now();
  saveCache(cache);
}

export function getCachedTracks(playlistId: string): Track[] | null {
  return getCache().playlistTracks[playlistId] || null;
}

export function setCachedTracks(playlistId: string, tracks: Track[]) {
  const cache = getCache();
  const cleanedTracks = tracks.map((t) => ({
    ...t,
    artist: cleanArtistName(t.artist),
  }));
  cache.playlistTracks[playlistId] = cleanedTracks;
  const pl = cache.playlists.find((p) => p.id === playlistId);
  if (pl) {
    pl.trackCount = cleanedTracks.length;
  }
  cache.lastUpdated = Date.now();
  saveCache(cache);

  // Background prefetch thumbnails and lyrics for all tracks
  prefetchTrackMetadata(cleanedTracks);
}

export function addCachedTrack(playlistId: string, track: Track) {
  const cache = getCache();
  const cleanedTrack = { ...track, artist: cleanArtistName(track.artist) };
  const existingTracks = cache.playlistTracks[playlistId] || [];
  if (!existingTracks.some((t) => t.videoId === track.videoId)) {
    cache.playlistTracks[playlistId] = [...existingTracks, cleanedTrack];
  }
  const pl = cache.playlists.find((p) => p.id === playlistId);
  if (pl) {
    pl.trackCount = cache.playlistTracks[playlistId].length;
  }
  cache.lastUpdated = Date.now();
  saveCache(cache);
}

export function removeCachedTrack(playlistId: string, videoId: string) {
  const cache = getCache();
  const existingTracks = cache.playlistTracks[playlistId] || [];
  cache.playlistTracks[playlistId] = existingTracks.filter((t) => t.videoId !== videoId);
  const pl = cache.playlists.find((p) => p.id === playlistId);
  if (pl) {
    pl.trackCount = cache.playlistTracks[playlistId].length;
  }
  cache.lastUpdated = Date.now();
  saveCache(cache);
}

// Lyrics persistence
export function getSavedLyrics(artist: string, title: string) {
  ensureDirs();
  const { LYRICS_DIR } = getPaths();
  const cleanedArtist = cleanArtistName(artist);
  const safeName = `${cleanedArtist}_${title}`.replace(/[/\\?%*:|"<>]/g, '-').toLowerCase();
  const filePath = path.join(LYRICS_DIR, `${safeName}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveLyrics(artist: string, title: string, data: any) {
  ensureDirs();
  const { LYRICS_DIR } = getPaths();
  const cleanedArtist = cleanArtistName(artist);
  const safeName = `${cleanedArtist}_${title}`.replace(/[/\\?%*:|"<>]/g, '-').toLowerCase();
  const filePath = path.join(LYRICS_DIR, `${safeName}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Thumbnail path helper
export function getLocalThumbnailPath(videoId: string): string {
  const { THUMBNAILS_DIR } = getPaths();
  return path.join(THUMBNAILS_DIR, `${videoId}.webp`);
}

export function hasLocalThumbnail(videoId: string): boolean {
  return fs.existsSync(getLocalThumbnailPath(videoId));
}

function safeCacheKey(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function getLocalPlaylistThumbnailPath(playlistId: string): string {
  const { PLAYLIST_THUMBNAILS_DIR } = getPaths();
  return path.join(PLAYLIST_THUMBNAILS_DIR, `${safeCacheKey(playlistId)}.webp`);
}

export async function downloadAndCachePlaylistThumbnail(playlist: Playlist): Promise<void> {
  if (!playlist.id || !playlist.thumbnailUrl) return;
  const localPath = getLocalPlaylistThumbnailPath(playlist.id);
  if (croppedPlaylistIds.has(playlist.id)) return;
  try {
    const response = await fetch(playlist.thumbnailUrl);
    if (!response.ok) return;
    ensureDirs();
    const source = Buffer.from(await response.arrayBuffer());
    const trimmed = await sharp(source).trim({ background: '#000000', threshold: 12 }).toBuffer();
    const prepared = sharp(trimmed);
    const metadata = await prepared.metadata();
    const size = Math.min(metadata.width || 0, metadata.height || 0);
    if (!size) return;
    const cropped = await prepared.extract({
      left: Math.floor(((metadata.width || size) - size) / 2),
      top: Math.floor(((metadata.height || size) - size) / 2),
      width: size,
      height: size,
    }).toBuffer();
    fs.writeFileSync(localPath, cropped);
    croppedPlaylistIds.add(playlist.id);
  } catch {
    // Keep the remote URL available as a fallback when offline caching is unavailable.
  }
}

async function prefetchPlaylistThumbnails(playlists: Playlist[]): Promise<void> {
  for (const playlist of playlists) {
    await downloadAndCachePlaylistThumbnail(playlist);
  }
}

// Prefetch thumbnails and lyrics in background
export async function downloadAndCacheThumbnail(videoId: string, remoteUrl?: string): Promise<void> {
  if (!videoId) return;
  const localPath = getLocalThumbnailPath(videoId);
  if (croppedTrackIds.has(videoId)) return;

  const url = remoteUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const source = Buffer.from(await res.arrayBuffer());
      const trimmed = await sharp(source).trim({ background: '#000000', threshold: 12 }).toBuffer();
      const prepared = sharp(trimmed);
      const metadata = await prepared.metadata();
      const size = Math.min(metadata.width || 0, metadata.height || 0);
      if (!size) return;
      const buffer = await prepared.extract({
        left: Math.floor(((metadata.width || size) - size) / 2),
        top: Math.floor(((metadata.height || size) - size) / 2),
        width: size,
        height: size,
      }).toBuffer();
      ensureDirs();
      fs.writeFileSync(localPath, buffer);
      croppedTrackIds.add(videoId);
    }
  } catch (e) {
    // Non-blocking catch
  }
}

export async function prefetchTrackMetadata(tracks: Track[]): Promise<void> {
  // Asynchronous background prefetching of lyrics and thumbnails
  setTimeout(async () => {
    for (const track of tracks) {
      try {
        if (!hasLocalThumbnail(track.videoId)) {
          await downloadAndCacheThumbnail(track.videoId, track.thumbnailUrl);
        }
        const cleanedArtist = cleanArtistName(track.artist);
        if (!getSavedLyrics(cleanedArtist, track.title)) {
          const lrclibUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(track.title)}&artist_name=${encodeURIComponent(cleanedArtist)}`;
          const res = await fetch(lrclibUrl, {
            headers: { 'Lrclib-Client': 'YTMusicPersonal/1.0.0' },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.syncedLyrics || data.plainLyrics) {
              saveLyrics(cleanedArtist, track.title, {
                syncedLyrics: data.syncedLyrics ?? null,
                plainLyrics: data.plainLyrics ?? null,
                trackName: data.trackName,
                artistName: data.artistName,
              });
            }
          }
        }
      } catch {
        // Ignore background prefetch errors
      }
    }
  }, 100);
}

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import type { Playlist, Track } from '@/types';
import { cleanArtistName } from './ytmusicApi';
import { getDataDir } from './nativeData';

const croppedPlaylistIds = new Set<string>();
const croppedTrackIds = new Set<string>();

function accountFileKey(accountId = 'default') {
  return accountId.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_').slice(0, 120) || 'default';
}

function getPaths(accountId = 'default') {
const DATA_DIR = path.resolve(getDataDir());
  return {
    DATA_DIR,
    METADATA_PATH: path.join(DATA_DIR, `metadata_cache_${accountFileKey(accountId)}.json`),
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
  importedPlaylists: string[];
  hiddenPlaylists: string[];
  pinnedPlaylists: string[];
  playlistOrder: string[];
  unpinnedPlaylistOrder?: string[];
  hiddenPinnedPlaylists?: string[];
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
  importedPlaylists: [],
  hiddenPlaylists: [],
  pinnedPlaylists: [],
  playlistOrder: [],
  volume: 1,
  isMuted: false,
  isShuffle: false,
  repeatMode: 'off',
  playbackSession: null,
};

function getCache(accountId = 'default'): MetadataCache {
  ensureDirs();
  const { METADATA_PATH } = getPaths(accountId);
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

function saveCache(cache: MetadataCache, accountId = 'default') {
  ensureDirs();
  const { METADATA_PATH } = getPaths(accountId);
  fs.writeFileSync(METADATA_PATH, JSON.stringify(cache, null, 2));
}

export function getCachedPlaylists(accountId = 'default'): Playlist[] {
  return getCache(accountId).playlists;
}

export function setCachedPlaylists(playlists: Playlist[], accountId = 'default') {
  const cache = getCache(accountId);
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
  saveCache(cache, accountId);
  void prefetchPlaylistThumbnails(playlists);
}

export function deleteCachedPlaylist(playlistId: string, accountId = 'default') {
  const cache = getCache(accountId);
  cache.playlists = cache.playlists.filter((p) => p.id !== playlistId);
  delete cache.playlistTracks[playlistId];
  cache.lastUpdated = Date.now();
  saveCache(cache, accountId);
}

export function getCachedTracks(playlistId: string, accountId = 'default'): Track[] | null {
  return getCache(accountId).playlistTracks[playlistId] || null;
}

export function setCachedTracks(playlistId: string, tracks: Track[], accountId = 'default') {
  const cache = getCache(accountId);
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
  saveCache(cache, accountId);

  // Background prefetch thumbnails and lyrics for all tracks
  prefetchTrackMetadata(cleanedTracks);
}

export function addCachedTrack(playlistId: string, track: Track, accountId = 'default') {
  const cache = getCache(accountId);
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
  saveCache(cache, accountId);
}

export function removeCachedTrack(playlistId: string, videoId: string, accountId = 'default') {
  const cache = getCache(accountId);
  const existingTracks = cache.playlistTracks[playlistId] || [];
  cache.playlistTracks[playlistId] = existingTracks.filter((t) => t.videoId !== videoId);
  const pl = cache.playlists.find((p) => p.id === playlistId);
  if (pl) {
    pl.trackCount = cache.playlistTracks[playlistId].length;
  }
  cache.lastUpdated = Date.now();
  saveCache(cache, accountId);
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
  // Versioned name ensures older center-cropped/lossy caches are not reused.
  return path.join(THUMBNAILS_DIR, `${videoId}.lossless.webp`);
}

export function hasLocalThumbnail(videoId: string): boolean {
  return fs.existsSync(getLocalThumbnailPath(videoId));
}

function safeCacheKey(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function normalizeMusicThumbnailUrl(url: string): string {
  // YT Music artwork is served as square googleusercontent images. Request
  // the small square variant instead of the large source rendition.
  if (url.includes('googleusercontent.com')) {
    return url.replace(/=w\d+-h\d+/i, '=w1200-h1200');
  }
  return url;
}

export function getLocalPlaylistThumbnailPath(playlistId: string): string {
  const { PLAYLIST_THUMBNAILS_DIR } = getPaths();
  return path.join(PLAYLIST_THUMBNAILS_DIR, `${safeCacheKey(playlistId)}.lossless.webp`);
}

export async function downloadAndCachePlaylistThumbnail(playlist: Playlist): Promise<void> {
  if (!playlist.id || !playlist.thumbnailUrl) return;
  const localPath = getLocalPlaylistThumbnailPath(playlist.id);
  if (croppedPlaylistIds.has(playlist.id)) return;
  try {
    const response = await fetch(normalizeMusicThumbnailUrl(playlist.thumbnailUrl));
    if (!response.ok) return;
    ensureDirs();
      const source = Buffer.from(await response.arrayBuffer());
      const sourceMeta = await sharp(source).metadata();
      if (sourceMeta.width !== sourceMeta.height) return;
      // Keep the artwork intact. Cropping/trimming here used to remove edge
      // content and the default WebP encoder introduced visible softness.
      // A lossless WebP keeps the local cache fast while preserving pixels.
      const lossless = await sharp(source).webp({ lossless: true }).toBuffer();
      fs.writeFileSync(localPath, lossless);
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

  // Artwork must come from the thumbnail URL returned by Music. Do not
  // synthesize a large YouTube video thumbnail when it is missing.
  const url = remoteUrl ? normalizeMusicThumbnailUrl(remoteUrl) : undefined;
  if (!url) return;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const source = Buffer.from(await res.arrayBuffer());
      const sourceMeta = await sharp(source).metadata();
      // Never cache landscape video thumbnails. Music artwork is square;
      // rejecting anything else prevents accidental crop-based replacements.
      if (sourceMeta.width !== sourceMeta.height) return;
      // Cache the original composition without center-cropping or lossy
      // re-encoding so fullscreen artwork remains sharp.
      const buffer = await sharp(source).webp({ lossless: true }).toBuffer();
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

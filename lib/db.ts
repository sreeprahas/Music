import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import type { Playlist, Track } from '@/types';
import { cleanArtistName, getThumbnailUrl } from './ytmusicFormat';
import { getDataDir } from './nativeData';
import { cacheKey } from './cache/keys';
import { getPersistent, setPersistent } from './cache/persistent';

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
  };
}

export function ensureDirs() {
  const { DATA_DIR, LYRICS_DIR, THUMBNAILS_DIR } = getPaths();
  [DATA_DIR, LYRICS_DIR, THUMBNAILS_DIR].forEach((d) => {
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
  /** Spotify track ID → YouTube video ID mapping cache. */
  spotifyYoutubeMap?: Record<string, YoutubeMapping>;
  lastUpdated: number;
}

/** Cached Spotify→YouTube resolution, with metadata for invalidation. */
export interface YoutubeMapping {
  spotifyTrackId: string;
  youtubeVideoId: string;
  matchedTitle?: string;
  matchedArtist?: string;
  duration?: number;
  resolvedAt: number;
  matchMethod?: 'manual_override' | 'metadata' | 'artwork_fallback';
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
  const updated: UserSettings = { ...current, ...settings };
  cache.userSettings[key] = updated;
  saveCache(cache);
  return updated;
}

function saveCache(cache: MetadataCache, accountId = 'default') {
  ensureDirs();
  const { METADATA_PATH } = getPaths(accountId);
  fs.writeFileSync(METADATA_PATH, JSON.stringify(cache, null, 2));
}

function withPlaylistArtwork(playlist: Playlist, tracks: Track[]): Playlist {
  const artworkTracks = tracks.slice(0, 4).filter((track) => Boolean(track.videoId));
  playlist.thumbnailVideoIds = artworkTracks.map((track) => track.videoId);
  playlist.thumbnailUrls = artworkTracks.map((track) => track.thumbnailUrl || getThumbnailUrl(track.videoId, track.title));
  return playlist;
}

export function getCachedPlaylists(accountId = 'default'): Playlist[] {
  const cache = getCache(accountId);
  return cache.playlists.map((playlist) => {
    const tracks = cache.playlistTracks[playlist.id] || [];
    if (tracks.length === 0) return playlist;
    return withPlaylistArtwork(playlist, tracks);
  });
}

/** Local playlist store. There is deliberately no account or remote-sync layer. */
export function getLocalPlaylists(): Playlist[] {
  return getCachedPlaylists('default');
}

/** Find an existing local playlist by its source URL (for deduplication). */
export function findLocalPlaylistBySourceUrl(sourceUrl: string): Playlist | undefined {
  const cache = getCache('default');
  return cache.playlists.find((p) => p.sourceUrl === sourceUrl);
}

export function setCachedPlaylists(playlists: Playlist[], accountId = 'default') {
  const cache = getCache(accountId);
  cache.playlists = playlists.map((playlist) => withPlaylistArtwork(playlist, cache.playlistTracks[playlist.id] || []));
  cache.lastUpdated = Date.now();
  saveCache(cache, accountId);
}

export function deleteCachedPlaylist(playlistId: string, accountId = 'default') {
  const cache = getCache(accountId);
  cache.playlists = cache.playlists.filter((p) => p.id !== playlistId);
  delete cache.playlistTracks[playlistId];
  cache.lastUpdated = Date.now();
  saveCache(cache, accountId);
}

export function upsertLocalPlaylist(playlist: Playlist, tracks?: Track[]): Playlist {
  const cache = getCache('default');
  const index = cache.playlists.findIndex((item) => item.id === playlist.id);
  if (index >= 0) cache.playlists[index] = { ...cache.playlists[index], ...playlist };
  else cache.playlists.push(playlist);
  if (tracks) cache.playlistTracks[playlist.id] = tracks.map((track, position) => ({ ...track, playlistId: playlist.id, position }));
  const stored = cache.playlists.find((item) => item.id === playlist.id)!;
  if (tracks) withPlaylistArtwork(stored, cache.playlistTracks[playlist.id]);
  stored.trackCount = cache.playlistTracks[playlist.id]?.length ?? stored.trackCount ?? 0;
  cache.lastUpdated = Date.now();
  saveCache(cache, 'default');
  return stored;
}

export function reorderCachedTracks(playlistId: string, videoIds: string[]): Track[] {
  const cache = getCache('default');
  const tracks = cache.playlistTracks[playlistId] || [];
  const byId = new Map(tracks.map((track) => [track.videoId, track]));
  const ordered = [
    ...videoIds.map((id) => byId.get(id)).filter((track): track is Track => Boolean(track)),
    ...tracks.filter((track) => !videoIds.includes(track.videoId)),
  ].map((track, position) => ({ ...track, position, playlistId }));
  cache.playlistTracks[playlistId] = ordered;
  const playlist = cache.playlists.find((item) => item.id === playlistId);
  if (playlist) withPlaylistArtwork(playlist, ordered);
  cache.lastUpdated = Date.now();
  saveCache(cache, 'default');
  return ordered;
}

export function getCachedTracks(playlistId: string, accountId = 'default'): Track[] | null {
  return getCache(accountId).playlistTracks[playlistId] || null;
}

/**
 * Persist tracks to the metadata cache.
 * thumbnailUrl in each track must already be the final local API URL
 * (i.e., /api/thumbnail?v=<videoId>) — call downloadAllTrackThumbnails()
 * before this to ensure images are on disk.
 */
export function setCachedTracks(playlistId: string, tracks: Track[], accountId = 'default') {
  const cache = getCache(accountId);
  const cleanedTracks = tracks.map((t) => ({
    ...t,
    artist: cleanArtistName(t.artist),
    // Preserve the thumbnailUrl as-is — it should already point to local API.
    thumbnailUrl: t.thumbnailUrl,
  }));
  cache.playlistTracks[playlistId] = cleanedTracks;
  const pl = cache.playlists.find((p) => p.id === playlistId);
  if (pl) {
    pl.trackCount = cleanedTracks.length;
    withPlaylistArtwork(pl, cleanedTracks);
  }
  cache.lastUpdated = Date.now();
  saveCache(cache, accountId);

  // Background prefetch lyrics only (thumbnails are already downloaded at import time).
  prefetchLyrics(cleanedTracks);
}

export function addCachedTrack(playlistId: string, track: Track, accountId = 'default') {
  const cache = getCache(accountId);
  const cleanedTrack = {
    ...track,
    artist: cleanArtistName(track.artist),
    thumbnailUrl: getThumbnailUrl(track.videoId, track.title),
  };
  const existingTracks = cache.playlistTracks[playlistId] || [];
  if (!existingTracks.some((t) => t.videoId === track.videoId)) {
    cache.playlistTracks[playlistId] = [...existingTracks, cleanedTrack];
  }
  const pl = cache.playlists.find((p) => p.id === playlistId);
  if (pl) {
    pl.trackCount = cache.playlistTracks[playlistId].length;
    withPlaylistArtwork(pl, cache.playlistTracks[playlistId]);
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
    withPlaylistArtwork(pl, cache.playlistTracks[playlistId]);
  }
  cache.lastUpdated = Date.now();
  saveCache(cache, accountId);
}

// ─── Spotify → YouTube mapping cache ──────────────────────────────────────────
// Avoids re-searching YouTube for a Spotify track every time it's played.

/** Look up a cached YouTube video ID for a Spotify track ID. */
export function getYoutubeMapping(spotifyTrackId: string): YoutubeMapping | undefined {
  const cache = getCache('default');
  const legacy = cache.spotifyYoutubeMap?.[spotifyTrackId];
  if (legacy) return legacy;
  const record = getPersistent<{ youtubeVideoId?: string; matchedAt?: number; sourceTitle?: string; sourceArtist?: string; sourceDuration?: number; matchMethod?: YoutubeMapping['matchMethod'] }>(cacheKey.match(spotifyTrackId));
  if (!record?.youtubeVideoId) return undefined;
  return { spotifyTrackId, youtubeVideoId: record.youtubeVideoId, matchedTitle: record.sourceTitle, matchedArtist: record.sourceArtist, duration: record.sourceDuration, resolvedAt: record.matchedAt || Date.now(), matchMethod: record.matchMethod };
}

/** Store a Spotify→YouTube mapping so future plays skip the search. */
export function setYoutubeMapping(mapping: YoutubeMapping): void {
  const cache = getCache('default');
  if (!cache.spotifyYoutubeMap) cache.spotifyYoutubeMap = {};
  cache.spotifyYoutubeMap[mapping.spotifyTrackId] = mapping;
  cache.lastUpdated = Date.now();
  saveCache(cache, 'default');
  setPersistent(cacheKey.match(mapping.spotifyTrackId), { spotifyTrackId: mapping.spotifyTrackId, youtubeVideoId: mapping.youtubeVideoId, matchMethod: mapping.matchMethod || 'metadata', diagnostics: [], matchedAt: mapping.resolvedAt, sourceTitle: mapping.matchedTitle, sourceArtist: mapping.matchedArtist, sourceDuration: mapping.duration }, 0);
}

/** Remove a cached mapping (e.g., when the YouTube video becomes unavailable). */
export function removeYoutubeMapping(spotifyTrackId: string): void {
  const cache = getCache('default');
  if (cache.spotifyYoutubeMap?.[spotifyTrackId]) {
    delete cache.spotifyYoutubeMap[spotifyTrackId];
    cache.lastUpdated = Date.now();
    saveCache(cache, 'default');
  }
}

// ─── Lyrics persistence ──────────────────────────────────────────────────────

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

// ─── Thumbnail paths ──────────────────────────────────────────────────────────

export function getLocalThumbnailPath(videoId: string): string {
  const { THUMBNAILS_DIR } = getPaths();
  return path.join(THUMBNAILS_DIR, `${videoId}.webp`);
}

export function hasLocalThumbnail(videoId: string): boolean {
  return fs.existsSync(getLocalThumbnailPath(videoId));
}

// ─── Core image processing ────────────────────────────────────────────────────

/**
 * Normalize a remote thumbnail URL to the highest available resolution.
 * Only used during the download phase — never stored in metadata.
 * Preserve YouTube Music square artwork URLs from lh3.googleusercontent.com.
 */
function normalizeMusicThumbnailUrl(url: string): string {
  if (url.includes('lh3.googleusercontent.com')) {
    // YouTube Music square artwork — keep as-is to preserve original square image.
    return url;
  }
  if (url.includes('googleusercontent.com')) {
    return url.replace(/=w\d+-h\d+/i, '=w1200-h1200');
  }
  if (url.includes('i.ytimg.com')) {
    return url.replace(/hqdefault\.jpg/i, 'maxresdefault.jpg');
  }
  return url;
}

function getThumbnailFallbackUrls(url: string): string[] {
  // If the stored URL is already a local API URL, we cannot use it to fetch remotely.
  // Derive YouTube thumbnail URLs from the videoId instead.
  if (url.startsWith('/api/thumbnail')) {
    const match = url.match(/[?&]v=([^&]+)/);
    const videoId = match ? decodeURIComponent(match[1]) : '';
    if (videoId) {
      return [
        `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        `https://i.ytimg.com/vi/${videoId}/default.jpg`,
      ];
    }
    return [];
  }
  const normalized = normalizeMusicThumbnailUrl(url);
  if (normalized.includes('lh3.googleusercontent.com')) {
    return [normalized];
  }
  if (normalized.includes('i.ytimg.com')) {
    const base = normalized.replace(/\/\w+\.jpg$/i, '');
    return [
      `${base}/maxresdefault.jpg`,
      `${base}/hqdefault.jpg`,
      `${base}/mqdefault.jpg`,
      `${base}/default.jpg`,
    ];
  }
  return [normalized];
}

/**
 * Convert any source image buffer to a lossless WebP.
 * For images at least 1280x720, crop to exactly 720x720 by removing 280px
 * from each side horizontally and centering vertically.
 * For smaller or non-standard images, fall back to lossless WebP without crop.
 */
async function toLosslessWebp(source: Buffer): Promise<Buffer> {
  const image = sharp(source);
  const metadata = await image.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  if (width >= 1280 && height >= 720) {
    const left = 280;
    const top = Math.max(0, Math.floor((height - 720) / 2));
    return image.extract({ left, top, width: 720, height: 720 }).webp({ lossless: true }).toBuffer();
  }

  if (width && height && width > height) {
    const cropSize = Math.floor(height / 1.35);
    const left = Math.floor((width - cropSize) / 2);
    const top = Math.floor((height - cropSize) / 2);
    return image.extract({ left, top, width: cropSize, height: cropSize }).webp({ lossless: true }).toBuffer();
  }

  return image.webp({ lossless: true }).toBuffer();
}

// ─── Eager thumbnail download (called at import time) ─────────────────────────

/**
 * Download a single track thumbnail from its remote URL, apply lossless
 * center-crop scaling, and write it to disk as <videoId>.webp.
 * Returns the local API URL to store in metadata, or the original
 * getThumbnailUrl() path if the download fails.
 */
export async function downloadAndCacheThumbnail(videoId: string, remoteUrl?: string): Promise<void> {
  if (!videoId) return;
  const localPath = getLocalThumbnailPath(videoId);
  if (croppedTrackIds.has(videoId)) return;
  if (fs.existsSync(localPath)) { croppedTrackIds.add(videoId); return; }

  const urls = remoteUrl ? getThumbnailFallbackUrls(remoteUrl) : [];
  if (!urls.length) return;
  try {
    let source: Buffer | null = null;
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          source = Buffer.from(await res.arrayBuffer());
          break;
        }
      } catch {
        // try next fallback
      }
    }
    if (!source) return;
    ensureDirs();
    const buffer = await toLosslessWebp(source);
    fs.writeFileSync(localPath, buffer);
    croppedTrackIds.add(videoId);
  } catch {
    // Non-blocking
  }
}

/**
 * Eagerly download ALL thumbnails for a list of tracks at import time.
 * Each track's remote thumbnailUrl is downloaded, lossless-cropped, and saved.
 * After this call every videoId has a local .webp file on disk.
 * Returns a new tracks array with thumbnailUrl replaced by the local API URL.
 */
export async function downloadAllTrackThumbnails(tracks: Track[]): Promise<Track[]> {
  ensureDirs();
  // Use bounded concurrency to avoid overwhelming the network with hundreds of simultaneous fetches.
  await runWithConcurrency(tracks, 10, (track) => downloadAndCacheThumbnail(track.videoId, track.thumbnailUrl));
  // Replace each track's thumbnailUrl with the stable local API URL.
  return tracks.map((track) => ({
    ...track,
    thumbnailUrl: getThumbnailUrl(track.videoId, track.title),
  }));
}

// ─── Bulk metadata image download ─────────────────────────────────────────────

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  const runners: Promise<void>[] = [];
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    runners.push((async () => {
      while (index < items.length) {
        const current = items[index++];
        await worker(current);
      }
    })());
  }
  await Promise.all(runners);
}

export async function downloadAllMetadataImages(accountId = 'default'): Promise<{ playlists: number; tracks: number }> {
  ensureDirs();
  const cache = getCache(accountId);
  const tracks = Object.values(cache.playlistTracks).flat().filter((track) => track.thumbnailUrl);

  console.log(`[metadata-images] Downloading ${tracks.length} track thumbnails...`);
  await runWithConcurrency(tracks, 8, (track) => downloadAndCacheThumbnail(track.videoId, track.thumbnailUrl));

  console.log(`[metadata-images] Done.`);
  return {
    // Kept for compatibility with the existing response shape. Playlist art is
    // now composed from the first four cached track thumbnails.
    playlists: 0,
    tracks: tracks.length,
  };
}

// ─── Background lyrics prefetch (thumbnails handled at import time) ───────────

async function prefetchLyrics(tracks: Track[]): Promise<void> {
  setTimeout(async () => {
    for (const track of tracks) {
      try {
        const cleanedArtist = cleanArtistName(track.artist);
        if (!getSavedLyrics(cleanedArtist, track.title)) {
          const lrclibUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(track.title)}&artist_name=${encodeURIComponent(cleanedArtist)}`;
          const res = await fetch(lrclibUrl, { headers: { 'Lrclib-Client': 'YTMusicPersonal/1.0.0' } });
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
        // Ignore background errors
      }
    }
  }, 100);
}

/**
 * @deprecated Use downloadAllTrackThumbnails() at import time instead.
 * Kept for any callers that may still exist outside the import flow.
 */
export async function prefetchTrackMetadata(tracks: Track[]): Promise<void> {
  setTimeout(async () => {
    for (const track of tracks) {
      try {
        if (!hasLocalThumbnail(track.videoId)) {
          await downloadAndCacheThumbnail(track.videoId, track.thumbnailUrl);
        }
      } catch {
        // Ignore
      }
    }
  }, 100);
  await prefetchLyrics(tracks);
}

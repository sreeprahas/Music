/**
 * lib/storage/thumbnails.ts
 *
 * Playlist-scoped thumbnail storage.
 *
 * Layout:
 *   DATA_DIR/thumbnails/{playlist_id}/{trackKey}.webp — per-track artwork
 *
 * No cover.webp is written. Playlist cards always use the four-track mosaic.
 *
 * `trackKey` = sourceTrackId (Spotify 22-char ID) or videoId (YT 11-char ID).
 *
 * A composite 2x2 mosaic (1280x1280 lossless WebP) is generated on demand
 * from the four cached track thumbnails and served via the
 * /api/playlist/[playlistId]/cover endpoint. The composite is cached in
 * memory by playlistId; invalidated when any of the four source thumbnails
 * is re-downloaded.
 *
 * The global DATA_DIR/thumbnails/*.webp flat layout is no longer used.
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { getDataDir } from '@/lib/nativeData';
import type { Track } from '@/types';

// ─── Global thumbnail directory (override/YouTube tracks) ─────────────────────

export function getGlobalThumbnailDir(): string {
  return path.join(getThumbnailsRoot(), 'global');
}

export function getGlobalThumbnailPath(videoId: string): string {
  return path.join(getGlobalThumbnailDir(), `${safeFileName(videoId)}.webp`);
}

export function getGlobalThumbnailHiPath(videoId: string): string {
  return path.join(getGlobalThumbnailDir(), `${safeFileName(videoId)}.hi.webp`);
}

export function hasGlobalThumbnail(videoId: string): boolean {
  return fs.existsSync(getGlobalThumbnailPath(videoId));
}

export function deleteGlobalThumbnail(videoId: string): void {
  try {
    const p = getGlobalThumbnailPath(videoId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    const hiP = getGlobalThumbnailHiPath(videoId);
    if (fs.existsSync(hiP)) fs.unlinkSync(hiP);
    const mimeP = `${p}.mime`;
    if (fs.existsSync(mimeP)) fs.unlinkSync(mimeP);
  } catch { /* best-effort */ }
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

function getThumbnailsRoot(): string {
  return path.join(path.resolve(getDataDir()), 'thumbnails');
}

/** Sanitize a playlist ID to a safe directory name. */
function safeDirName(playlistId: string): string {
  return playlistId.replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 120);
}

/** Sanitize a track key to a safe filename. */
function safeFileName(key: string): string {
  return key.replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 120);
}

export function getPlaylistThumbnailDir(playlistId: string): string {
  return path.join(getThumbnailsRoot(), safeDirName(playlistId));
}

export function getTrackThumbnailPath(playlistId: string, trackKey: string): string {
  return path.join(getPlaylistThumbnailDir(playlistId), `${safeFileName(trackKey)}.webp`);
}

/** 1280×1280 lossless WebP rendition, used for OS media controls. */
export function getTrackThumbnailHiPath(playlistId: string, trackKey: string): string {
  return path.join(getPlaylistThumbnailDir(playlistId), `${safeFileName(trackKey)}.hi.webp`);
}

export function hasTrackThumbnail(playlistId: string, trackKey: string): boolean {
  return fs.existsSync(getTrackThumbnailPath(playlistId, trackKey));
}

export function hasTrackThumbnailHi(playlistId: string, trackKey: string): boolean {
  return fs.existsSync(getTrackThumbnailHiPath(playlistId, trackKey));
}

/** The local API URL for a track thumbnail. */
export function trackThumbnailApiUrl(playlistId: string, trackKey: string, title?: string): string {
  const slug = title
    ? title.trim().replace(/[/\\?%*:|"<>]/g, '').replace(/\s+/g, '-').slice(0, 40) || 'track'
    : 'track';
  return `/api/thumbnail/${encodeURIComponent(slug)}?playlistId=${encodeURIComponent(playlistId)}&v=${encodeURIComponent(trackKey)}`;
}

// ─── Image processing ─────────────────────────────────────────────────────────

function isAllowedImageHost(hostname: string): boolean {
  return (
    hostname === 'i.ytimg.com' ||
    hostname.endsWith('.googleusercontent.com') ||
    hostname === 'googleusercontent.com' ||
    hostname.endsWith('.scdn.co') ||
    hostname.endsWith('.spotifycdn.com')
  );
}

function normalizeMusicThumbnailUrl(url: string): string {
  if (url.includes('googleusercontent.com')) {
    return url.replace(/=w\d+-h\d+[^?#]*/i, '=w1200-h1200');
  }
  if (url.includes('i.ytimg.com')) {
    return url.replace(/hqdefault\.jpg/i, 'maxresdefault.jpg');
  }
  if (url.includes('mosaic.scdn.co')) {
    return url.replace(/\/mosaic\.scdn\.co\/\d+\//i, '/mosaic.scdn.co/640/');
  }

  // Spotify image URLs encode the requested rendition in the four hex digits
  // after `ab67616d0000`. Force the 640x640 rendition for any Spotify image
  // variant instead of only handling a couple of known size codes.
  if (url.includes('i.scdn.co/image/')) {
    return url.replace(/ab67616d0000[0-9a-f]{4}/i, 'ab67616d0000b273');
  }

  return url;
}

function getThumbnailFallbackUrls(url: string): string[] {
  // If it's already a local API URL, derive YT thumbnail from videoId param
  if (url.startsWith('/api/thumbnail')) {
    const match = url.match(/[?&]v=([^&]+)/);
    const videoId = match ? decodeURIComponent(match[1]) : '';
    if (/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
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

async function processTrackThumbnail(source: Buffer): Promise<Buffer> {
  const image = sharp(source);
  const metadata = await image.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  let pipeline = sharp(source);
  if (width >= 1280 && height >= 720) {
    const left = 280;
    const top = Math.max(0, Math.floor((height - 720) / 2));
    pipeline = pipeline.extract({ left, top, width: 720, height: 720 });
  } else if (width && height && width > height && (width / height) > 1.25) {
    const cropSize = Math.floor(height / 1.35);
    const left = Math.floor((width - cropSize) / 2);
    const top = Math.floor((height - cropSize) / 2);
    pipeline = pipeline.extract({ left, top, width: cropSize, height: cropSize });
  }
  return pipeline.resize(640, 640, { fit: 'cover', position: 'center' }).webp({ lossless: true }).toBuffer();
}

/**
 * 1280×1280 lossless WebP rendition used by OS media controls. Same source
 * crop as the 640×640 tile, but rendered at OS-resolution so the lock screen
 * / taskbar / hardware display is never upscaling a 640px source.
 */
async function processTrackThumbnailHi(source: Buffer): Promise<Buffer> {
  const image = sharp(source);
  const metadata = await image.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  let pipeline = sharp(source);
  if (width >= 1280 && height >= 720) {
    const left = 280;
    const top = Math.max(0, Math.floor((height - 720) / 2));
    pipeline = pipeline.extract({ left, top, width: 720, height: 720 });
  } else if (width && height && width > height && (width / height) > 1.25) {
    const cropSize = Math.floor(height / 1.35);
    const left = Math.floor((width - cropSize) / 2);
    const top = Math.floor((height - cropSize) / 2);
    pipeline = pipeline.extract({ left, top, width: cropSize, height: cropSize });
  }
  return pipeline.resize(1280, 1280, { fit: 'cover', position: 'center' }).webp({ lossless: true }).toBuffer();
}

/** Check if existing image file is already exactly 640x640. If smaller or different, upgrades it. */
async function ensureExact640Image(destPath: string): Promise<boolean> {
  if (!fs.existsSync(destPath)) return false;
  try {
    const raw = fs.readFileSync(destPath);
    const meta = await sharp(raw).metadata();
    if (meta.width === 640 && meta.height === 640) {
      return true;
    }
    const upgraded = await processTrackThumbnail(raw);
    fs.writeFileSync(destPath, upgraded);
    return true;
  } catch {
    return false;
  }
}

/** Check if the 1280x1280 OS-artwork rendition exists. */
async function ensureExact1280Image(destPath: string): Promise<boolean> {
  if (!fs.existsSync(destPath)) return false;
  try {
    const raw = fs.readFileSync(destPath);
    const meta = await sharp(raw).metadata();
    return meta.width === 1280 && meta.height === 1280;
  } catch {
    return false;
  }
}

// ─── Download helpers ─────────────────────────────────────────────────────────

/** Download a single image to a specific filesystem path. Returns true on success. */
export async function downloadImageToPath(
  remoteUrl: string,
  destPath: string,
  options: { forceRefresh?: boolean } = {},
): Promise<boolean> {
  if (!remoteUrl || !destPath) return false;
  if (!options.forceRefresh && await ensureExact640Image(destPath)) return true;
  const urls = remoteUrl.startsWith('/api/') ? getThumbnailFallbackUrls(remoteUrl) : [remoteUrl, ...getThumbnailFallbackUrls(remoteUrl)].filter(Boolean);
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !isAllowedImageHost(parsed.hostname)) continue;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const source = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const buffer = await processTrackThumbnail(source);
      fs.writeFileSync(destPath, buffer);
      // Also write the 1280x1280 OS-artwork rendition.
      const hiPath = destPath.replace(/\.webp$/, '.hi.webp');
      const hiBuffer = await processTrackThumbnailHi(source);
      fs.writeFileSync(hiPath, hiBuffer);
      // The composite for this playlist is now stale — invalidate so the
      // next request rebuilds it with the new source tile.
      invalidatePlaylistComposite(path.basename(path.dirname(destPath)));
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

/**
 * Download a YouTube video thumbnail to the global dir.
 * Used for override tracks that don't belong to any playlist.
 * Returns the local path on success, null on failure.
 */
export async function downloadYouTubeThumbnailToGlobal(videoId: string): Promise<string | null> {
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
  const dest = getGlobalThumbnailPath(videoId);
  const hiDest = getGlobalThumbnailHiPath(videoId);

  // Already have a 640x640 lossless copy — ensure hi-res exists.
  if (await ensureExact640Image(dest)) {
    if (!fs.existsSync(hiDest)) {
      const source = fs.readFileSync(dest);
      const hiBuffer = await processTrackThumbnailHi(source);
      fs.writeFileSync(hiDest, hiBuffer);
    }
    return dest;
  }

  const fallbackUrls = [
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/default.jpg`,
  ];

  for (const url of fallbackUrls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const source = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(getGlobalThumbnailDir(), { recursive: true });
      const buffer = await processTrackThumbnail(source);
      fs.writeFileSync(dest, buffer);
      const hiBuffer = await processTrackThumbnailHi(source);
      fs.writeFileSync(hiDest, hiBuffer);
      return dest;
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Delete all cached assets for the old videoId after a YouTube override.
 * Cleans up: global thumbnail, cached audio (not explicit downloads).
 * Does NOT delete: explicit downloads, playlist-scoped thumbnails.
 */
export function deleteOldOverrideAssets(oldVideoId: string, sourceTrackId?: string): void {
  deleteGlobalThumbnail(oldVideoId);
  if (sourceTrackId) deleteGlobalThumbnail(sourceTrackId);

  // Delete cached audio (not explicit downloads — only the 'cache' store).
  try {
    const { deleteCachedAudio } = require('@/lib/cache/streamCache');
    deleteCachedAudio(oldVideoId);
  } catch { /* module not available in all contexts */ }
}

/** Download a single track thumbnail into the playlist-scoped dir. */
export async function downloadTrackThumbnail(
  playlistId: string,
  trackKey: string,
  remoteUrl?: string,
): Promise<string> {
  if (!trackKey) return '';
  const dest = getTrackThumbnailPath(playlistId, trackKey);
  const isSpotifyTrack = /^[A-Za-z0-9]{22}$/.test(trackKey);
  const isLocalApiUrl = Boolean(remoteUrl?.startsWith('/api/'));

  // A Spotify track must be downloaded from Spotify again when this function
  // runs. Never treat an existing 640x640 cached/upscaled file as the source.
  // Local API URLs are cache references, not remote image sources.
  const forceRefresh = isSpotifyTrack || Boolean(remoteUrl && !isLocalApiUrl);
  if (!forceRefresh && await ensureExact640Image(dest)) return dest;

  const candidateUrls: string[] = [];
  const addCandidate = (value?: string) => {
    if (!value || value.startsWith('/api/')) return;
    const normalized = normalizeMusicThumbnailUrl(value);
    if (!candidateUrls.includes(normalized)) candidateUrls.push(normalized);
  };

  addCandidate(remoteUrl);

  // For Spotify tracks, inspect every artwork source returned by the embed
  // payload and try them from largest to smallest. This fixes tracks whose
  // primary image URL is missing, broken, or points at a tiny rendition.
  if (/^[A-Za-z0-9]{22}$/.test(trackKey)) {
    try {
      const trackRes = await fetch(`https://open.spotify.com/embed/track/${trackKey}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (trackRes.ok) {
        const html = await trackRes.text();
        const match = /<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
        if (match?.[1]) {
          const data = JSON.parse(match[1]) as Record<string, unknown>;
          const entity = (data as any)?.props?.pageProps?.state?.data?.entity;

          const sources = [
            ...((Array.isArray(entity?.visualIdentity?.image) ? entity.visualIdentity.image : []) as any[]),
            ...((Array.isArray(entity?.coverArt?.sources) ? entity.coverArt.sources : []) as any[]),
          ]
            .filter((item) => item && typeof item === 'object' && typeof item.url === 'string')
            .sort((a, b) => {
              const aSize = Math.max(Number(a.width || 0), Number(a.height || 0), Number(a.maxWidth || 0), Number(a.maxHeight || 0));
              const bSize = Math.max(Number(b.width || 0), Number(b.height || 0), Number(b.maxWidth || 0), Number(b.maxHeight || 0));
              return bSize - aSize;
            });

          for (const source of sources) addCandidate(source.url);
        }
      }
    } catch {}
  }

  // Last-resort fallback for sources that are not exposed by the Spotify
  // embed payload.
  if (candidateUrls.length === 0 && remoteUrl && !remoteUrl.startsWith('/api/')) {
    addCandidate(remoteUrl);
  }

  for (const url of candidateUrls) {
    if (await downloadImageToPath(url, dest, { forceRefresh: true })) return dest;
  }

  return dest;
}

// ─── Concurrent bulk download ─────────────────────────────────────────────────

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const runners: Promise<void>[] = [];
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    runners.push(
      (async () => {
        while (index < items.length) {
          const current = items[index++];
          await worker(current);
        }
      })(),
    );
  }
  await Promise.all(runners);
}

/**
 * Download artwork for all tracks in a playlist into the playlist-scoped dir.
 * Returns updated tracks with `thumbnailUrl` pointing to the local API.
 */
export async function downloadAllTrackThumbnails(
  playlistId: string,
  tracks: Track[],
): Promise<Track[]> {
  fs.mkdirSync(getPlaylistThumbnailDir(playlistId), { recursive: true });

  await runWithConcurrency(tracks, 10, async (track) => {
    const key = track.sourceTrackId || track.videoId;
    if (!key) return;
    await downloadTrackThumbnail(playlistId, key, track.thumbnailUrl);
  });

  return tracks.map((track) => {
    const key = track.sourceTrackId || track.videoId;
    if (!key) return track;
    return {
      ...track,
      thumbnailUrl: trackThumbnailApiUrl(playlistId, key, track.title),
    };
  });
}

/**
 * Reconcile the thumbnail directory for a playlist:
 * - Download images for all current tracks.
 * - Delete images for tracks no longer in the playlist.
 */
export async function reconcilePlaylistThumbnails(
  playlistId: string,
  currentTracks: Track[],
  coverUrl?: string,
): Promise<Track[]> {
  const dir = getPlaylistThumbnailDir(playlistId);
  fs.mkdirSync(dir, { recursive: true });

  // (cover.webp is no longer written — playlist cards always use the
  //  four-track mosaic.)

  // Download all track images
  const updatedTracks = await downloadAllTrackThumbnails(playlistId, currentTracks);

  // Delete orphaned track images (files in dir not corresponding to a current track)
  const currentKeys = new Set(
    currentTracks.map((t) => safeFileName(t.sourceTrackId || t.videoId)).filter(Boolean),
  );
  try {
    for (const file of fs.readdirSync(dir)) {
      const stem = file.replace(/\.webp$/, '');
      if (!currentKeys.has(stem)) {
        try { fs.unlinkSync(path.join(dir, file)); } catch {}
      }
    }
  } catch {}

  return updatedTracks;
}

/** Delete the entire playlist thumbnail directory. */
export function deletePlaylistThumbnailDir(playlistId: string): void {
  const dir = getPlaylistThumbnailDir(playlistId);
  if (fs.existsSync(dir)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

/** Download all thumbnails for all known playlists (bulk refresh). */
export async function downloadAllMetadataImages(
  playlists: Array<{ id: string; thumbnailUrl?: string }>,
  allTracks: Array<{ playlistId: string; tracks: Track[] }>,
): Promise<{ playlists: number; tracks: number }> {
  let trackCount = 0;
  for (const { playlistId, tracks } of allTracks) {
    // Do not filter out local `/api/thumbnail/...` references. Those are cache
    // URLs and still need to trigger a real source download during refresh.
    const toDownload = tracks.filter((t) => Boolean(t.sourceTrackId || t.videoId));
    if (toDownload.length === 0) continue;
    await runWithConcurrency(toDownload, 8, async (track) => {
      const key = track.sourceTrackId || track.videoId;
      if (key) {
        await downloadTrackThumbnail(playlistId, key, track.thumbnailUrl);
      }
    });
    trackCount += toDownload.length;
  }
  return { playlists: playlists.length, tracks: trackCount };
}

// ─── Composite 2x2 playlist cover ─────────────────────────────────────────────

/**
 * Per-playlist in-memory cache for the composite WebP. Maps playlistId
 * → { buffer, mtime } where mtime is the latest mtime of any of the four
 * source thumbnails. When a source thumbnail is rewritten, the cache entry
 * becomes stale and is regenerated on the next request.
 */
type CompositeEntry = { buffer: Buffer; sourceMtimes: number[] };
const compositeCache = new Map<string, CompositeEntry>();

/** API URL for a playlist's composite 2x2 cover. */
export function playlistCompositeApiUrl(playlistId: string): string {
  return `/api/playlist/${encodeURIComponent(playlistId)}/cover`;
}

/** Drop the composite cache for one playlist (or all). */
export function invalidatePlaylistComposite(playlistId?: string): void {
  if (playlistId !== undefined) compositeCache.delete(playlistId);
  else compositeCache.clear();
}

/**
 * Build a 1280x1280 lossless WebP composite from the first four cached
 * track thumbnails for `playlistId`. Returns null when fewer than four
 * cached thumbnails are available. The result is cached in memory.
 */
export async function generatePlaylistComposite(
  playlistId: string,
  tracks: Array<{ sourceTrackId?: string; videoId?: string }>,
): Promise<Buffer | null> {
  const tiles: Buffer[] = [];
  const sourceMtimes: number[] = [];

  for (const track of tracks.slice(0, 4)) {
    const key = track.sourceTrackId || track.videoId;
    if (!key) break;
    const tilePath = getTrackThumbnailPath(playlistId, key);
    if (!fs.existsSync(tilePath)) break;
    try {
      tiles.push(fs.readFileSync(tilePath));
      sourceMtimes.push(fs.statSync(tilePath).mtimeMs);
    } catch {
      break;
    }
  }

  if (tiles.length < 4) return null;

  // Cache hit if the four source mtimes match.
  const cached = compositeCache.get(playlistId);
  if (
    cached &&
    cached.sourceMtimes.length === sourceMtimes.length &&
    cached.sourceMtimes.every((m, i) => m === sourceMtimes[i])
  ) {
    return cached.buffer;
  }

  const composite = await sharp({
    create: {
      width: 1280,
      height: 1280,
      channels: 4,
      background: { r: 18, g: 18, b: 18, alpha: 1 },
    },
  })
    .composite([
      { input: tiles[0], top: 0, left: 0 },
      { input: tiles[1], top: 0, left: 640 },
      { input: tiles[2], top: 640, left: 0 },
      { input: tiles[3], top: 640, left: 640 },
    ])
    .webp({ lossless: true })
    .toBuffer();

  compositeCache.set(playlistId, { buffer: composite, sourceMtimes });
  return composite;
}
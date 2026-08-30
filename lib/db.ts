/**
 * lib/db.ts  — STORAGE SHIM
 *
 * All persistent library metadata now lives in SQLite (lib/storage/).
 * This file re-exports the public API so existing API routes and components
 * require no import changes.
 *
 * The old JSON metadata_cache_*.json system has been replaced entirely.
 * Do NOT add new code here — add it to lib/storage/*.
 */

// ─── Re-exports from storage layer ───────────────────────────────────────────

export type { UserSettings } from './storage/settings';
export type { YoutubeMapping } from './storage/mapping';

export { getDb, getDbPath, closeDb } from './storage/db';
import { getDb as _getDb } from './storage/db';

export {
  getLocalPlaylists,
  getPlaylistById,
  findPlaylistBySourceUrl,
  upsertPlaylist as upsertLocalPlaylist,
  deletePlaylist as deleteCachedPlaylist,
  reconcilePlaylist,
  getPlaylistWithArtwork,
  setPlaylistSyncOnOpen,
  allocateUniquePlaylistTitle,
  refreshPlaylistCoverArt,
} from './storage/playlists';

// Backwards-compat alias: findLocalPlaylistBySourceUrl
export { findPlaylistBySourceUrl as findLocalPlaylistBySourceUrl } from './storage/playlists';

export {
  getPlaylistTracks as getCachedTracks,
  setPlaylistTracks as setCachedTracks,
  addTrackToPlaylist as addCachedTrack,
  removeTrackFromPlaylist as removeCachedTrack,
  reorderPlaylistTracks as reorderCachedTracks,
} from './storage/tracks';

export {
  getUserSettings,
  saveUserSettings,
  DEFAULT_SETTINGS,
} from './storage/settings';

export { getLocalProfile, saveLocalProfile } from './storage/profile';
export type { StoredProfile } from './storage/profile';

export {
  getYoutubeMapping,
  setYoutubeMapping,
  removeYoutubeMapping,
} from './storage/mapping';

export {
  getPlaylistThumbnailDir,
  getTrackThumbnailPath,
  hasTrackThumbnail,
  trackThumbnailApiUrl,
  downloadAllTrackThumbnails,
  downloadAllMetadataImages,
  deletePlaylistThumbnailDir,
} from './storage/thumbnails';

// ─── Lyrics (unchanged — filesystem JSON) ────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { getDataDir } from './nativeData';
export { getSavedLyrics, saveLyrics, deleteSavedLyrics } from './storage/lyrics';

function getLyricsDir(): string {
  return path.join(path.resolve(getDataDir()), 'lyrics');
}

export function ensureDirs(): void {
  const dataDir = path.resolve(getDataDir());
  [dataDir, getLyricsDir()].forEach((d) => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
  // Purge legacy JSON cache files if present
  try {
    const files = fs.readdirSync(dataDir);
    for (const f of files) {
      if (f.startsWith('metadata_cache_') || f === 'entity-cache.json') {
        try { fs.unlinkSync(path.join(dataDir, f)); } catch {}
      }
    }
  } catch {}
  // Initialize SQLite DB
  _getDb();
}

// ─── Thumbnail helpers (legacy aliases — now playlist-scoped) ─────────────────
// Kept for the thumbnail API routes that still call getLocalThumbnailPath().
// They now look in the flat thumbnails dir for YouTube tracks without a playlist context.

import { getPlaylistTracks } from './storage/tracks';
import { getLocalPlaylists } from './storage/playlists';
import { getTrackThumbnailPath as _scopedPath } from './storage/thumbnails';

/**
 * Find the thumbnail path for a trackKey (videoId or sourceTrackId)
 * by scanning all playlists. Used by the thumbnail API as a fallback.
 */
// In-memory cache for findThumbnailInAnyPlaylist. The thumbnail API hits
// this on every track image load, and without caching it scans the
// filesystem once per playlist per request. Keyed by trackKey, invalidated
// whenever a new track thumbnail lands on disk.
const thumbnailScanCache = new Map<string, string | null>();

export function invalidateThumbnailScanCache(trackKey?: string): void {
  if (trackKey !== undefined) {
    thumbnailScanCache.delete(trackKey);
  } else {
    thumbnailScanCache.clear();
  }
}

export function findThumbnailInAnyPlaylist(trackKey: string): string | null {
  if (!trackKey) return null;
  const cached = thumbnailScanCache.get(trackKey);
  if (cached !== undefined) return cached;
  const playlists = getLocalPlaylists();
  for (const pl of playlists) {
    const p = _scopedPath(pl.id, trackKey);
    if (fs.existsSync(p)) {
      thumbnailScanCache.set(trackKey, p);
      return p;
    }
  }
  thumbnailScanCache.set(trackKey, null);
  return null;
}

/**
 * @deprecated — kept for compatibility only.
 * Use trackThumbnailApiUrl(playlistId, key, title) from storage/thumbnails instead.
 */
export function getLocalThumbnailPath(videoId: string): string {
  // Scan playlists to find it — used only by thumbnail API fallback
  if (!videoId) return '';
  const found = findThumbnailInAnyPlaylist(videoId);
  return found ?? path.join(path.resolve(getDataDir()), 'thumbnails', `${videoId}.webp`);
}

export function hasLocalThumbnail(videoId: string): boolean {
  if (!videoId) return false;
  return Boolean(findThumbnailInAnyPlaylist(videoId));
}

// ─── downloadAndCacheThumbnail (kept for compat, now no-op stub) ─────────────
// Real downloads happen through reconcilePlaylistThumbnails in storage/thumbnails.

export async function downloadAndCacheThumbnail(_videoId: string, _remoteUrl?: string): Promise<void> {
  // No-op — downloads are handled via reconcilePlaylist / downloadAllTrackThumbnails
}

// ─── Metadata images (bulk refresh) ──────────────────────────────────────────

export async function downloadAllMetadataImagesLegacy(): Promise<{ playlists: number; tracks: number }> {
  const { downloadAllMetadataImages } = await import('./storage/thumbnails');
  const playlists = getLocalPlaylists();
  const allTracks = playlists.map((pl) => ({ playlistId: pl.id, tracks: getPlaylistTracks(pl.id) }));
  return downloadAllMetadataImages(
    playlists.map((pl) => ({ id: pl.id, thumbnailUrl: pl.thumbnailUrl })),
    allTracks,
  );
}

// ─── prefetchTrackMetadata (kept for compat) ──────────────────────────────────

export async function prefetchTrackMetadata(_tracks: import('@/types').Track[]): Promise<void> {
  // No-op — thumbnails downloaded at import time via reconcilePlaylist
}

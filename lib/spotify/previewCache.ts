/**
 * Preview Caching Service
 *
 * 1. During preview: Downloads preview cover images into temporary preview cache
 *    directory (`DATA_DIR/cache/preview/`). Does NOT persist metadata to cache.
 * 2. On import: promotePreviewToPlaylistDir() copies preview images into
 *    the playlist-scoped thumbnail directory (handled in storage/thumbnails.ts).
 * 3. On delete: clearPreviewCache() purges associated preview files.
 *
 * Note: promotePreviewToRealData (flat global layout) is removed.
 * Use promotePreviewToPlaylistDir() from lib/storage/thumbnails.ts instead.
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { getDataDir } from '../nativeData';
import type { EmbedPreviewResult } from './embed';

export function getPreviewCacheDir(): string {
  const previewDir = path.join(path.resolve(getDataDir()), 'cache', 'preview');
  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true });
  }
  return previewDir;
}

export function getLocalPreviewImagePath(id: string): string {
  const dir = getPreviewCacheDir();
  return path.join(dir, `${id}.webp`);
}

/** Check if an image is in preview cache. */
export function hasPreviewImage(id: string): boolean {
  return fs.existsSync(getLocalPreviewImagePath(id));
}

/**
 * Cache preview images in temporary preview cache for immediate display.
 * NOTE: Metadata is NOT persisted to disk.
 */
export async function cachePreviewImages(
  playlistId: string,
  preview: EmbedPreviewResult,
): Promise<void> {
  const downloadTasks: Promise<void>[] = [];

  // Playlist cover
  if (preview.coverImage) {
    downloadTasks.push(
      downloadToPreviewCache(`playlist-${playlistId}`, preview.coverImage),
    );
  }

  // Track cover images
  for (let i = 0; i < preview.tracks.length; i++) {
    const track = preview.tracks[i];
    const trackKey = track.id || `track-${playlistId}-${i}`;
    if (track.image) {
      downloadTasks.push(downloadToPreviewCache(trackKey, track.image));
    }
  }

  await Promise.allSettled(downloadTasks);
}

/**
 * Download a remote image, convert to lossless WebP, and save to preview cache.
 */
async function downloadToPreviewCache(id: string, remoteUrl: string): Promise<void> {
  if (!id || !remoteUrl) return;
  const targetPath = getLocalPreviewImagePath(id);
  if (fs.existsSync(targetPath)) return;

  try {
    const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return;
    const arrayBuffer = await res.arrayBuffer();
    const sourceBuffer = Buffer.from(arrayBuffer);
    const webpBuffer = await sharp(sourceBuffer).webp({ lossless: true }).toBuffer();
    fs.writeFileSync(targetPath, webpBuffer);
  } catch {
    // Non-blocking for preview
  }
}

/**
 * Delete all temporary preview cache files for a playlist.
 */
export function clearPreviewCache(playlistId?: string): void {
  const dir = getPreviewCacheDir();
  if (!fs.existsSync(dir)) return;

  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (!playlistId || file.includes(playlistId)) {
        try {
          fs.unlinkSync(path.join(dir, file));
        } catch {}
      }
    }
  } catch {}
}

/**
 * lib/storage/thumbnails.ts
 *
 * Playlist-scoped thumbnail storage.
 *
 * Layout:
 *   DATA_DIR/thumbnails/{playlist_id}/cover.webp     — playlist cover
 *   DATA_DIR/thumbnails/{playlist_id}/{trackKey}.webp — per-track artwork
 *
 * `trackKey` = sourceTrackId (Spotify 22-char ID) or videoId (YT 11-char ID).
 *
 * The global DATA_DIR/thumbnails/*.webp flat layout is no longer used.
 * Preview cache remains at DATA_DIR/cache/preview/ (unchanged).
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { getDataDir } from '@/lib/nativeData';
import type { Track } from '@/types';

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

export function getPlaylistCoverPath(playlistId: string): string {
  return path.join(getPlaylistThumbnailDir(playlistId), 'cover.webp');
}

export function getTrackThumbnailPath(playlistId: string, trackKey: string): string {
  return path.join(getPlaylistThumbnailDir(playlistId), `${safeFileName(trackKey)}.webp`);
}

export function hasPlaylistCover(playlistId: string): boolean {
  return fs.existsSync(getPlaylistCoverPath(playlistId));
}

export function hasTrackThumbnail(playlistId: string, trackKey: string): boolean {
  return fs.existsSync(getTrackThumbnailPath(playlistId, trackKey));
}

/** The local API URL for a track thumbnail. */
export function trackThumbnailApiUrl(playlistId: string, trackKey: string, title?: string): string {
  const slug = title
    ? title.trim().replace(/[/\\?%*:|"<>]/g, '').replace(/\s+/g, '-').slice(0, 40) || 'track'
    : 'track';
  return `/api/thumbnail/${encodeURIComponent(slug)}?playlistId=${encodeURIComponent(playlistId)}&v=${encodeURIComponent(trackKey)}`;
}

/** The local API URL for a playlist cover. */
export function playlistCoverApiUrl(playlistId: string): string {
  return `/api/thumbnail/cover?playlistId=${encodeURIComponent(playlistId)}`;
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
  if (url.includes('lh3.googleusercontent.com')) return url;
  if (url.includes('googleusercontent.com')) return url.replace(/=w\d+-h\d+/i, '=w1200-h1200');
  if (url.includes('i.ytimg.com')) return url.replace(/hqdefault\.jpg/i, 'maxresdefault.jpg');
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

// ─── Download helpers ─────────────────────────────────────────────────────────

/** Download a single image to a specific filesystem path. Returns true on success. */
export async function downloadImageToPath(remoteUrl: string, destPath: string): Promise<boolean> {
  if (!remoteUrl || !destPath) return false;
  if (fs.existsSync(destPath)) return true;
  const urls = remoteUrl.startsWith('/api/') ? getThumbnailFallbackUrls(remoteUrl) : [remoteUrl, ...getThumbnailFallbackUrls(remoteUrl)].filter(Boolean);
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !isAllowedImageHost(parsed.hostname)) continue;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const source = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const buffer = await toLosslessWebp(source);
      fs.writeFileSync(destPath, buffer);
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

/** Download playlist cover artwork into playlist-scoped dir. */
export async function downloadPlaylistCover(playlistId: string, remoteUrl: string): Promise<void> {
  if (!remoteUrl) return;
  const dest = getPlaylistCoverPath(playlistId);
  await downloadImageToPath(remoteUrl, dest);
}

/** Download a single track thumbnail into the playlist-scoped dir. */
export async function downloadTrackThumbnail(
  playlistId: string,
  trackKey: string,
  remoteUrl?: string,
): Promise<string> {
  if (!trackKey) return '';
  const dest = getTrackThumbnailPath(playlistId, trackKey);
  if (fs.existsSync(dest)) return dest;

  let url = remoteUrl;
  if (!url && /^[A-Za-z0-9]{22}$/.test(trackKey)) {
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
        if (match && match[1]) {
          const data = JSON.parse(match[1]) as Record<string, unknown>;
          const entity = (data as any)?.props?.pageProps?.state?.data?.entity;
          const viImages = entity?.visualIdentity?.image;
          if (Array.isArray(viImages) && viImages.length > 0) {
            const sorted = [...viImages].sort((a: any, b: any) => (b.maxWidth || 0) - (a.maxWidth || 0));
            url = sorted[0]?.url || '';
          } else {
            url = entity?.coverArt?.sources?.[0]?.url || '';
          }
        }
      }
    } catch {}
  }

  if (url) {
    await downloadImageToPath(url, dest);
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

  // Download cover
  if (coverUrl) await downloadPlaylistCover(playlistId, coverUrl);

  // Download all track images
  const updatedTracks = await downloadAllTrackThumbnails(playlistId, currentTracks);

  // Delete orphaned track images (files in dir not corresponding to a current track)
  const currentKeys = new Set(
    currentTracks.map((t) => safeFileName(t.sourceTrackId || t.videoId)).filter(Boolean),
  );
  currentKeys.add('cover'); // preserve cover
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

/** Promote preview cache images into the playlist-scoped thumbnail dir. */
export async function promotePreviewToPlaylistDir(
  playlistId: string,
  tracks: Track[],
  previewDir: string,
): Promise<void> {
  const destDir = getPlaylistThumbnailDir(playlistId);
  fs.mkdirSync(destDir, { recursive: true });

  const rawId = playlistId.replace(/^spotify-/, '');

  // Playlist cover
  for (const name of [`playlist-${playlistId}.webp`, `playlist-${rawId}.webp`]) {
    const previewCover = path.join(previewDir, name);
    const destCover = getPlaylistCoverPath(playlistId);
    if (fs.existsSync(previewCover) && !fs.existsSync(destCover)) {
      try { fs.copyFileSync(previewCover, destCover); break; } catch {}
    }
  }

  // Per-track images
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const trackKey = track.sourceTrackId || track.videoId;
    if (!trackKey) continue;
    const dest = getTrackThumbnailPath(playlistId, trackKey);
    if (fs.existsSync(dest)) continue;
    // Try by track ID first
    const byId = path.join(previewDir, `${trackKey}.webp`);
    if (fs.existsSync(byId)) {
      try { fs.copyFileSync(byId, dest); continue; } catch {}
    }
    // Fallback by position
    for (const posName of [`track-${playlistId}-${i}.webp`, `track-${rawId}-${i}.webp`]) {
      const byPos = path.join(previewDir, posName);
      if (fs.existsSync(byPos)) {
        try { fs.copyFileSync(byPos, dest); break; } catch {}
      }
    }
  }
}

/** Download all thumbnails for all known playlists (bulk refresh). */
export async function downloadAllMetadataImages(
  playlists: Array<{ id: string; thumbnailUrl?: string }>,
  allTracks: Array<{ playlistId: string; tracks: Track[] }>,
): Promise<{ playlists: number; tracks: number }> {
  let trackCount = 0;
  for (const { id, thumbnailUrl } of playlists) {
    if (thumbnailUrl && thumbnailUrl.startsWith('http')) {
      await downloadPlaylistCover(id, thumbnailUrl);
    }
  }
  for (const { playlistId, tracks } of allTracks) {
    const toDownload = tracks.filter((t) => t.thumbnailUrl && t.thumbnailUrl.startsWith('http'));
    if (toDownload.length === 0) continue;
    await runWithConcurrency(toDownload, 8, async (track) => {
      const key = track.sourceTrackId || track.videoId;
      if (key && track.thumbnailUrl) {
        await downloadTrackThumbnail(playlistId, key, track.thumbnailUrl);
      }
    });
    trackCount += toDownload.length;
  }
  return { playlists: playlists.length, tracks: trackCount };
}

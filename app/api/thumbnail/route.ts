/**
 * GET /api/thumbnail
 *
 * Serves track/playlist artwork. Looks in the playlist-scoped directory first,
 * then falls back to preview cache, then YouTube CDN for 11-char video IDs.
 *
 * Query params:
 *   v          = trackKey (videoId or sourceTrackId)           required
 *   playlistId = playlist ID for scoped lookup                  optional but preferred
 */

import fs from 'fs';
import path from 'path';
import { getDataDir } from '@/lib/nativeData';
import { getTrackThumbnailPath } from '@/lib/storage/thumbnails';
import { findThumbnailInAnyPlaylist } from '@/lib/db';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SVG_PLACEHOLDER = `<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" fill="#1e1e1e"/><path d="M60 40v30.55c-1.59-.94-3.42-1.55-5.4-1.55-5.97 0-10.8 4.83-10.8 10.8S48.63 90.6 54.6 90.6 65.4 85.77 65.4 79.8V50.8h10.8V40H60z" fill="#ff5540" opacity="0.6"/></svg>`;

function previewPath(trackKey: string): string {
  return path.join(path.resolve(getDataDir()), 'cache', 'preview', `${trackKey}.webp`);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const trackKey = searchParams.get('v') || searchParams.get('videoId');
  const playlistId = searchParams.get('playlistId');

  if (!trackKey) return new Response('Missing v', { status: 400 });
  if (!/^[A-Za-z0-9_.:\-]{1,80}$/.test(trackKey)) return new Response('Invalid v', { status: 400 });

  // 1. Playlist-scoped thumbnail (preferred)
  if (playlistId && /^[A-Za-z0-9_.:\-]{1,120}$/.test(playlistId)) {
    const scopedPath = getTrackThumbnailPath(playlistId, trackKey);
    if (fs.existsSync(scopedPath)) {
      return new Response(fs.readFileSync(scopedPath), {
        headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' },
      });
    }
  }

  // 2. Search all playlists for this track key
  const anyPath = findThumbnailInAnyPlaylist(trackKey);
  if (anyPath && fs.existsSync(anyPath)) {
    return new Response(fs.readFileSync(anyPath), {
      headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  }

  // 3. Preview cache (transient, during import flow)
  const preview = previewPath(trackKey);
  if (fs.existsSync(preview)) {
    return new Response(fs.readFileSync(preview), {
      headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=3600' },
    });
  }

  // 4. YouTube CDN fallback for 11-char video IDs
  if (/^[A-Za-z0-9_-]{11}$/.test(trackKey)) {
    for (const remoteUrl of [
      `https://i.ytimg.com/vi/${trackKey}/maxresdefault.jpg`,
      `https://i.ytimg.com/vi/${trackKey}/hqdefault.jpg`,
    ]) {
      try {
        const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(10_000) });
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          return new Response(buffer, {
            headers: { 'Content-Type': res.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' },
          });
        }
      } catch { /* try next */ }
    }
  }

  return new Response(SVG_PLACEHOLDER, { headers: { 'Content-Type': 'image/svg+xml' } });
}

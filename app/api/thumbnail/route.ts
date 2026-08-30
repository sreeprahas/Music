/**
 * GET /api/thumbnail
 *
 * Serves track/playlist artwork. Lookup order:
 *   1. Global dir (DATA_DIR/thumbnails/global/{v}.webp) — override/YouTube tracks
 *   2. Playlist-scoped (DATA_DIR/thumbnails/{playlistId}/{v}.webp)
 *   3. Scan all playlists
 *   4. Placeholder SVG
 *
 * Query params:
 *   v          = trackKey (videoId or sourceTrackId) required
 *   playlistId = playlist ID for scoped lookup (optional)
 */

import fs from 'fs';
import { getTrackThumbnailPath, getGlobalThumbnailPath, hasGlobalThumbnail } from '@/lib/storage/thumbnails';
import { findThumbnailInAnyPlaylist } from '@/lib/db';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SVG_PLACEHOLDER = `<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" fill="#1e1e1e"/><path d="M60 40v30.55c-1.59-.94-3.42-1.55-5.4-1.55-5.97 0-10.8 4.83-10.8 10.8S48.63 90.6 54.6 90.6 65.4 85.77 65.4 79.8V50.8h10.8V40H60z" fill="#ff5540" opacity="0.6"/></svg>`;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const trackKey = searchParams.get('v') || searchParams.get('videoId');
  const playlistId = searchParams.get('playlistId');

  if (!trackKey) {
    return new Response('Missing v', { status: 400 });
  }

  if (!/^[A-Za-z0-9_.:\-]{1,80}$/.test(trackKey)) {
    return new Response('Invalid v', { status: 400 });
  }

  // 1. Global thumbnail (override/YouTube tracks) — checked first
  if (/^[A-Za-z0-9_-]{11}$/.test(trackKey) && hasGlobalThumbnail(trackKey)) {
    const globalPath = getGlobalThumbnailPath(trackKey);
    return new Response(fs.readFileSync(globalPath), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  }

  // 2. Playlist-scoped thumbnail
  if (playlistId && /^[A-Za-z0-9_.:\-]{1,120}$/.test(playlistId)) {
    const scopedPath = getTrackThumbnailPath(playlistId, trackKey);

    if (fs.existsSync(scopedPath)) {
      return new Response(fs.readFileSync(scopedPath), {
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    }
  }

  // 3. Search all playlists for this track key
  const anyPath = findThumbnailInAnyPlaylist(trackKey);

  if (anyPath && fs.existsSync(anyPath)) {
    return new Response(fs.readFileSync(anyPath), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  }

  // 4. Placeholder SVG (no YouTube CDN fallback — local-only artwork)
  return new Response(SVG_PLACEHOLDER, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-store',
    },
  });
}
/**
 * GET /api/thumbnail/[slug]
 *
 * Serves track artwork by slug (human-readable title).
 * The actual track key comes from the `v` query param.
 *
 * Query params:
 *   v          = trackKey (videoId or sourceTrackId)
 *   playlistId = playlist ID for scoped lookup (optional)
 *   size       = 'hi' returns the 1280x1280 OS-artwork rendition. Default is 640x640.
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

import {
  getTrackThumbnailPath,
  getTrackThumbnailHiPath,
  getGlobalThumbnailPath,
  getGlobalThumbnailHiPath,
} from '@/lib/storage/thumbnails';

import { findThumbnailInAnyPlaylist } from '@/lib/db';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SVG_PLACEHOLDER = `<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" fill="#1e1e1e"/><path d="M60 40v30.55c-1.59-.94-3.42-1.55-5.4-1.55-5.97 0-10.8 4.83-10.8 10.8S48.63 90.6 54.6 90.6 65.4 85.77 65.4 79.8V50.8h10.8V40H60z" fill="#ff5540" opacity="0.6"/></svg>`;

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

const LONG_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
};

/**
 * Lazy-generate a 1280x1280 OS-artwork rendition from an existing 640x640
 * source WebP. Used when ?size=hi is requested but the .hi.webp file does not
 * yet exist (older installations, freshly-imported playlists, etc.).
 */
async function ensureHiFrom640(sourcePath: string, hiPath: string): Promise<Buffer | null> {
  try {
    const raw = fs.readFileSync(sourcePath);
    const buffer = await sharp(raw).resize(1280, 1280, { fit: 'cover', position: 'center' }).webp({ lossless: true }).toBuffer();
    fs.mkdirSync(path.dirname(hiPath), { recursive: true });
    fs.writeFileSync(hiPath, buffer);
    return buffer;
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug?: string }> },
) {
  const { searchParams } = new URL(request.url);

  const resolvedParams = await params;
  const slug = resolvedParams?.slug || '';

  const playlistId = searchParams.get('playlistId');
  const trackKey = searchParams.get('v') || searchParams.get('videoId');
  const wantHi = searchParams.get('size') === 'hi';

  // ── Track thumbnail ────────────────────────────────────────────────────────
  if (!trackKey) {
    return new Response('Missing v', { status: 400 });
  }

  if (!/^[A-Za-z0-9_.:\-]{1,80}$/.test(trackKey)) {
    return new Response('Invalid v', { status: 400 });
  }

  // 1. Playlist-scoped thumbnail
  if (
    playlistId &&
    /^[A-Za-z0-9_.:\-]{1,120}$/.test(playlistId)
  ) {
    const scopedPath = getTrackThumbnailPath(playlistId, trackKey);
    const scopedHi = getTrackThumbnailHiPath(playlistId, trackKey);

    if (fs.existsSync(scopedPath)) {
      if (wantHi) {
        if (!fs.existsSync(scopedHi)) {
          const generated = await ensureHiFrom640(scopedPath, scopedHi);
          if (generated) {
            return new Response(new Uint8Array(generated), {
              headers: { 'Content-Type': 'image/webp', ...LONG_CACHE_HEADERS },
            });
          }
        } else {
          return new Response(new Uint8Array(fs.readFileSync(scopedHi)), {
            headers: { 'Content-Type': 'image/webp', ...LONG_CACHE_HEADERS },
          });
        }
      }
      return new Response(new Uint8Array(fs.readFileSync(scopedPath)), {
        headers: {
          'Content-Type': 'image/webp',
          ...LONG_CACHE_HEADERS,
        },
      });
    }
  }

  // 2. Scan all playlists
  const anyPath = findThumbnailInAnyPlaylist(trackKey);

  if (anyPath && fs.existsSync(anyPath)) {
    if (wantHi) {
      const hiPath = anyPath.replace(/\.webp$/, '.hi.webp');
      if (fs.existsSync(hiPath)) {
        return new Response(new Uint8Array(fs.readFileSync(hiPath)), {
          headers: { 'Content-Type': 'image/webp', ...LONG_CACHE_HEADERS },
        });
      }
      const generated = await ensureHiFrom640(anyPath, hiPath);
      if (generated) {
        return new Response(new Uint8Array(generated), {
          headers: { 'Content-Type': 'image/webp', ...LONG_CACHE_HEADERS },
        });
      }
    }
    return new Response(new Uint8Array(fs.readFileSync(anyPath)), {
      headers: {
        'Content-Type': 'image/webp',
        ...LONG_CACHE_HEADERS,
      },
    });
  }

  // 2b. Global thumbnail (YouTube override tracks without a playlist context)
  if (/^[A-Za-z0-9_-]{11}$/.test(trackKey)) {
    const globalPath = getGlobalThumbnailPath(trackKey);
    if (fs.existsSync(globalPath)) {
      if (wantHi) {
        const hiPath = getGlobalThumbnailHiPath(trackKey);
        if (fs.existsSync(hiPath)) {
          return new Response(new Uint8Array(fs.readFileSync(hiPath)), {
            headers: { 'Content-Type': 'image/webp', ...LONG_CACHE_HEADERS },
          });
        }
        const generated = await ensureHiFrom640(globalPath, hiPath);
        if (generated) {
          return new Response(new Uint8Array(generated), {
            headers: { 'Content-Type': 'image/webp', ...LONG_CACHE_HEADERS },
          });
        }
      }
      return new Response(new Uint8Array(fs.readFileSync(globalPath)), {
        headers: { 'Content-Type': 'image/webp', ...LONG_CACHE_HEADERS },
      });
    }
  }

  // 3. Placeholder SVG — no YouTube CDN fallback; local-only artwork.
  return new Response(SVG_PLACEHOLDER, {
    headers: {
      'Content-Type': 'image/svg+xml',
      ...NO_CACHE_HEADERS,
    },
  });
}
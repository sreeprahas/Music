/**
 * GET /api/playlist/[playlistId]/cover
 *
 * Serves a 1280x1280 lossless WebP composite cover generated on demand from
 * the first four cached track thumbnails for the playlist. The composite is
 * assembled in memory and cached by source mtime — no cover.webp is ever
 * written to the data dir.
 *
 * Cache headers: long-lived (1 day fresh + 7 day stale-while-revalidate) so
 * the cover image renders immediately on subsequent loads.
 */

import { NextRequest } from 'next/server';
import { getPlaylistTracks } from '@/lib/storage/tracks';
import { generatePlaylistComposite } from '@/lib/storage/thumbnails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LONG_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
};

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

const SVG_PLACEHOLDER = `<svg width="1280" height="1280" viewBox="0 0 1280 1280" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="1280" height="1280" fill="#1e1e1e"/><path d="M640 426v325.92c-16.93-10.01-36.42-16.49-57.49-16.49-63.55 0-115 51.45-115 115S518.96 965 582.51 965s115-51.45 115-115V540h115V426H640z" fill="#ff5540" opacity="0.6"/></svg>`;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ playlistId?: string }> },
) {
  const { playlistId } = await params;
  if (!playlistId) {
    return new Response('Missing playlistId', { status: 400 });
  }
  if (!/^[A-Za-z0-9_.:\-]{1,120}$/.test(playlistId)) {
    return new Response('Invalid playlistId', { status: 400 });
  }

  let tracks: ReturnType<typeof getPlaylistTracks>;
  try {
    tracks = getPlaylistTracks(playlistId);
  } catch {
    tracks = [];
  }

  const composite = await generatePlaylistComposite(playlistId, tracks);

  if (!composite) {
    // Fewer than 4 cached track thumbnails — fall back to a placeholder so
    // the <img> always resolves with a sensible 200 response.
    return new Response(SVG_PLACEHOLDER, {
      headers: {
        'Content-Type': 'image/svg+xml',
        ...NO_CACHE_HEADERS,
      },
    });
  }

  return new Response(new Uint8Array(composite), {
    headers: {
      'Content-Type': 'image/webp',
      ...LONG_CACHE_HEADERS,
    },
  });
}

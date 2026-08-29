/**
 * GET /api/stream/prefetch?videoId=<id>
 *
 * Warms the server-side stream URL cache for the given videoId without
 * blocking the caller. Returns immediately so the client never waits.
 *
 * Response:
 *   { status: 'hit' }      – URL already cached, next /api/stream is instant
 *   { status: 'warming' }  – yt-dlp started in background
 *   { status: 'local' }    – track is downloaded locally, no prefetch needed
 */
import { NextResponse } from 'next/server';
import { isUsableAudio } from '@/lib/cache/audio';
import { getStreamUrl } from '@/lib/downloader';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Mirror the same in-memory cache key used in downloader.ts so we can detect
// hits without duplicating the logic. The cache lives in the same Node.js
// module instance as the stream route.
// We re-export a small helper from downloader.ts to check the cache.

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = (searchParams.get('videoId') || '').trim();

  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: 'Missing or invalid videoId' }, { status: 400 });
  }

  // If the track is already downloaded locally, no prefetch needed.
  if (isUsableAudio(videoId)) {
    return NextResponse.json({ status: 'local' });
  }

  // Attempt a cache-only probe: call getStreamUrl which reads the in-memory
  // cache instantly if warm. If it's cached, return 'hit'.
  // If not, fire it in the background (no await) and return 'warming'.
  let isCached = false;
  try {
    // getStreamUrl checks the cache first and returns sub-millisecond if warm.
    // We use a very short timeout probe: if it resolves within 5ms it was cached.
    const probe = await Promise.race([
      getStreamUrl(videoId),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5)),
    ]);
    if (probe !== null) {
      isCached = true;
    }
  } catch {
    // Not cached or failed — fire background warm-up below.
  }

  if (isCached) {
    return NextResponse.json({ status: 'hit' });
  }

  // Not in cache — fire background resolution without awaiting.
  // This starts yt-dlp and populates the cache so the next /api/stream
  // call returns from memory in < 1 ms.
  getStreamUrl(videoId).catch(() => {
    // Prefetch failure is non-fatal — the main stream route will retry.
  });

  return NextResponse.json({ status: 'warming' });
}

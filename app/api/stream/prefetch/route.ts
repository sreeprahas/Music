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
import { getStreamUrl, hasCachedStreamUrl } from '@/lib/downloader';

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

  if (hasCachedStreamUrl(videoId)) {
    return NextResponse.json({ status: 'hit' });
  }

  // Start resolution in the background. getStreamUrl coalesces duplicate
  // requests, so a simultaneous /api/stream call can await the same promise.
  void getStreamUrl(videoId).catch(() => {});

  return NextResponse.json({ status: 'warming' });
}

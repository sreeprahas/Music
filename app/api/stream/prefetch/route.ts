/**
 * GET /api/stream/prefetch?videoId=<id>
 *
 * Warms the server-side stream URL cache for the given videoId without
 * blocking the caller. Returns immediately so the client never waits.
 *
 * Response:
 *   { status: 'local' }    – a downloaded/cached copy exists, no prefetch needed
 *   { status: 'hit' }      – URL already cached, next /api/stream is instant
 *   { status: 'warming' }  – yt-dlp started in background
 */
import { NextResponse } from 'next/server';
import { resolveLocalAudioStore } from '@/lib/cache/streamCache';
import { getStreamUrl, hasCachedStreamUrl } from '@/lib/downloader';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = (searchParams.get('videoId') || '').trim();

  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: 'Missing or invalid videoId' }, { status: 400 });
  }

  // If a local copy (download or cache) exists, no prefetch is needed.
  if (resolveLocalAudioStore(videoId)) {
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

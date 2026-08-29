/**
 * GET /api/stream?videoId=<id>
 *
 * Resolves a direct audio stream URL for playback or points to local MP3.
 * Returns JSON { streamUrl: string } as expected by PlayerBar.
 */
import { NextResponse } from 'next/server';
import { isUsableAudio } from '@/lib/cache/audio';
import { getStreamUrl } from '@/lib/downloader';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = (searchParams.get('videoId') || searchParams.get('v') || '').trim();

  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: 'Missing or invalid videoId' }, { status: 400 });
  }

  // 1. If downloaded locally, direct player to local /api/mp3
  if (isUsableAudio(videoId)) {
    return NextResponse.json({ streamUrl: `/api/mp3?v=${encodeURIComponent(videoId)}` });
  }

  // 2. Resolve direct YouTube audio stream URL via yt-dlp
  try {
    const streamUrl = await getStreamUrl(videoId, request.signal);
    return NextResponse.json({ streamUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Stream unavailable';
    console.error(`[api/stream] Failed to get stream for ${videoId}:`, msg);
    return NextResponse.json({ error: msg, streamUrl: '' }, { status: 503 });
  }
}

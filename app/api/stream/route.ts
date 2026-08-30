/**
 * GET /api/stream?videoId=<id>
 *
 * Playback resolution order (Requirement: local copies always win):
 *   1. Explicitly downloaded song   → /api/mp3?v=…&store=downloads
 *   2. Automatically cached song    → /api/mp3?v=…&store=cache
 *   3. Otherwise                    → /api/stream/live?v=…
 *      (a local proxy that streams from YouTube AND writes the audio into the
 *       cache store so the next playback needs no network at all)
 *
 * Returns JSON { streamUrl: string } as expected by PlayerBar.
 */
import { NextResponse } from 'next/server';
import { resolveLocalAudioStore } from '@/lib/cache/streamCache';
import { getStreamUrl } from '@/lib/downloader';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function localStreamUrl(videoId: string, store: 'downloads' | 'cache'): string {
  return `/api/mp3?v=${encodeURIComponent(videoId)}&store=${store}`;
}

/** Optional display metadata forwarded to the caching proxy. */
function metaParams(searchParams: URLSearchParams): string {
  const parts: string[] = [];
  for (const key of ['title', 'artist', 'thumbnailUrl'] as const) {
    const value = (searchParams.get(key) || '').trim().slice(0, 300);
    if (value) parts.push(`${key}=${encodeURIComponent(value)}`);
  }
  return parts.length ? `&${parts.join('&')}` : '';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = (searchParams.get('videoId') || searchParams.get('v') || '').trim();

  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: 'Missing or invalid videoId' }, { status: 400 });
  }

  // 1./2. A valid local copy exists (downloaded or cached) — never touch the network.
  const localStore = resolveLocalAudioStore(videoId);
  console.log(`[api/stream] videoId=${videoId} localStore=${localStore || 'none'}`);
  if (localStore) {
    return NextResponse.json({ streamUrl: localStreamUrl(videoId, localStore), source: localStore });
  }

  // 3. Stream from the internet through the caching proxy. The proxy resolves
  //    the direct URL itself (coalesced via the shared stream URL cache) and
  //    tees the audio into the cache store while the player is playing.
  return NextResponse.json({
    streamUrl: `/api/stream/live?v=${encodeURIComponent(videoId)}${metaParams(searchParams)}`,
    source: 'network',
  });
}

/**
 * HEAD support kept for callers that probe availability. The live URL is only
 * reachable once the player actually requests it, so we report warm/cold by
 * trying to resolve the stream URL without blocking long.
 */
export async function HEAD(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = (searchParams.get('videoId') || searchParams.get('v') || '').trim();

  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return new Response(null, { status: 400 });
  }

  const localStore = resolveLocalAudioStore(videoId);
  if (localStore) {
    return new Response(null, { status: 200, headers: { 'X-Stream-Source': localStore } });
  }

  try {
    await getStreamUrl(videoId, request.signal);
    return new Response(null, { status: 200, headers: { 'X-Stream-Source': 'network' } });
  } catch {
    return new Response(null, { status: 503 });
  }
}

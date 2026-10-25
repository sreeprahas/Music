/**
 * TEMPORARY DIAGNOSTIC ROUTE — for renderer-direct playback experiment ONLY.
 *
 * GET /api/diagnostic/direct-playback?v=ELbmGJFAcV0
 *
 * Resolves the direct YouTube audio URL via youtubei.js and returns it as JSON.
 * The Electron renderer then sets audio.src = url directly (not /api/stream/live).
 *
 * Expected outcome:
 *   Path A (server proxy): Node fetch() → 403
 *   Path B (renderer direct): Electron fetch() → ?
 *
 * This route must NOT be deployed. It exposes the raw URL.
 */
import { NextResponse } from 'next/server';
import { getStreamUrl } from '@/lib/downloader';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = (searchParams.get('v') || searchParams.get('videoId') || '').trim();

  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: 'Invalid videoId' }, { status: 400 });
  }

  const t0 = Date.now();
  try {
    const url = await getStreamUrl(videoId, request.signal);
    const safeHost = (() => {
      try {
        const u = new URL(url);
        return u.hostname + u.pathname.split('/').slice(-2).join('/');
      } catch {
        return '(parse failed)';
      }
    })();
    return NextResponse.json({
      videoId,
      directUrl: url,           // raw signed URL — renderer uses this for audio.src
      safeHost,                // redacted for logs
      mimeType: 'audio/mp4',  // IOS itag=140 always returns audio/mp4
      resolveMs: Date.now() - t0,
      method: 'DIRECT',        // indicates renderer should play directly, not via /api/stream/live
    });
  } catch (err) {
    return NextResponse.json({
      videoId,
      error: err instanceof Error ? err.message : 'Resolution failed',
      resolveMs: Date.now() - t0,
    }, { status: 503 });
  }
}

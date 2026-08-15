import fs from 'fs';
import { getLocalThumbnailPath, downloadAndCacheThumbnail } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (process.env.IS_NATIVE_BUILD === 'true') {
    return new Response('Static stub');
  }

  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');
  const remoteUrl = searchParams.get('url');

  if (!videoId) {
    return new Response('Missing videoId', { status: 400 });
  }

  const localPath = getLocalThumbnailPath(videoId);

  // The first request in a process refreshes the cache with a center crop;
  // subsequent requests are served from the original filename unchanged.
  if (remoteUrl) {
    try { await downloadAndCacheThumbnail(videoId, remoteUrl); } catch { /* use cached/remote fallback */ }
  }

  if (fs.existsSync(localPath)) {
    const fileBuffer = fs.readFileSync(localPath);
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }

  // Attempt to download & cache thumbnail locally
  if (remoteUrl) {
    // Fallback to remote URL redirect if download fails
    return NextResponse.redirect(remoteUrl);
  }

  // SVG placeholder if thumbnail unavailable offline
  const svgPlaceholder = `<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" fill="#1e1e1e"/><path d="M60 40v30.55c-1.59-.94-3.42-1.55-5.4-1.55-5.97 0-10.8 4.83-10.8 10.8S48.63 90.6 54.6 90.6 65.4 85.77 65.4 79.8V50.8h10.8V40H60z" fill="#ff5540" opacity="0.6"/></svg>`;
  return new Response(svgPlaceholder, {
    headers: { 'Content-Type': 'image/svg+xml' },
  });
}

import fs from 'fs';
import { getLocalThumbnailPath } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SVG_PLACEHOLDER = `<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" fill="#1e1e1e"/><path d="M60 40v30.55c-1.59-.94-3.42-1.55-5.4-1.55-5.97 0-10.8 4.83-10.8 10.8S48.63 90.6 54.6 90.6 65.4 85.77 65.4 79.8V50.8h10.8V40H60z" fill="#ff5540" opacity="0.6"/></svg>`;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('v') || searchParams.get('videoId');

  if (!videoId) {
    return new Response('Missing videoId', { status: 400 });
  }

  const localPath = getLocalThumbnailPath(videoId);

  if (fs.existsSync(localPath)) {
    return new Response(fs.readFileSync(localPath), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }

  // Image not on disk — try fetching from YouTube directly as a fallback.
  // This allows preview images to load before the import downloads them locally.
  const remoteUrls = [
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  ];
  for (const remoteUrl of remoteUrls) {
    try {
      const res = await fetch(remoteUrl);
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        return new Response(buffer, {
          headers: {
            'Content-Type': res.headers.get('content-type') || 'image/jpeg',
            'Cache-Control': 'public, max-age=86400',
          },
        });
      }
    } catch {
      // try next
    }
  }

  // Return SVG placeholder rather than fetching remotely.
  return new Response(SVG_PLACEHOLDER, {
    headers: { 'Content-Type': 'image/svg+xml' },
  });
}

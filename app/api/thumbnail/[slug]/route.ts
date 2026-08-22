import fs from 'fs';
import { getLocalThumbnailPath } from '@/lib/db';
import { getLocalPreviewImagePath } from '@/lib/spotify/previewCache';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SVG_PLACEHOLDER = `<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" fill="#1e1e1e"/><path d="M60 40v30.55c-1.59-.94-3.42-1.55-5.4-1.55-5.97 0-10.8 4.83-10.8 10.8S48.63 90.6 54.6 90.6 65.4 85.77 65.4 79.8V50.8h10.8V40H60z" fill="#ff5540" opacity="0.6"/></svg>`;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug?: string }> }
) {
  const { searchParams } = new URL(request.url);
  const resolvedParams = await params;
  const videoId = searchParams.get('v') || searchParams.get('videoId') || resolvedParams?.slug;

  if (!videoId) {
    return new Response('Missing videoId', { status: 400 });
  }
  if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(videoId)) return new Response('Invalid videoId', { status: 400 });

  // 1. Real data thumbnail
  const localPath = getLocalThumbnailPath(videoId);
  if (fs.existsSync(localPath)) {
    return new Response(fs.readFileSync(localPath), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }

  // 2. Preview cache thumbnail
  const previewPath = getLocalPreviewImagePath(videoId);
  if (fs.existsSync(previewPath)) {
    return new Response(fs.readFileSync(previewPath), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  return new Response(SVG_PLACEHOLDER, {
    headers: { 'Content-Type': 'image/svg+xml' },
  });
}

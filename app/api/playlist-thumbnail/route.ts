import fs from 'fs';
import { getLocalPlaylistThumbnailPath, downloadAndCachePlaylistThumbnail } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const playlistId = searchParams.get('playlistId');
  const thumbnailUrl = searchParams.get('url');
  if (!playlistId) return new Response('Missing playlistId', { status: 400 });

  const localPath = getLocalPlaylistThumbnailPath(playlistId);
  if (thumbnailUrl) {
    await downloadAndCachePlaylistThumbnail({
      id: playlistId,
      thumbnailUrl,
      title: '',
      description: '',
      trackCount: 0,
    });
  }

  if (fs.existsSync(localPath)) {
    return new Response(fs.readFileSync(localPath), {
      headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  }
  return thumbnailUrl ? NextResponse.redirect(thumbnailUrl) : new Response('Thumbnail unavailable', { status: 404 });
}

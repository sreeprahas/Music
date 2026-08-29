/**
 * POST /api/youtube/playlist/preview
 *
 * Non-destructively previews a YouTube / YouTube Music playlist using yt-dlp.
 * Makes zero modifications to the SQLite database.
 */

import { NextResponse } from 'next/server';
import { previewYouTubePlaylist } from '@/lib/youtube/playlist';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    const url = body.url?.trim();

    if (!url) {
      return NextResponse.json({ error: 'Missing YouTube playlist url' }, { status: 400 });
    }

    const preview = await previewYouTubePlaylist(url);
    return NextResponse.json(preview);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to preview YouTube playlist' },
      { status: 500 },
    );
  }
}

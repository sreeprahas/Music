/**
 * POST /api/youtube/playlist/import
 *
 * Imports a YouTube / YouTube Music playlist into local SQLite via reconcilePlaylist().
 */

import { NextResponse } from 'next/server';
import { importYouTubePlaylist } from '@/lib/youtube/playlist';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string; title?: string };
    const url = body.url?.trim();

    if (!url) {
      return NextResponse.json({ error: 'Missing YouTube playlist url' }, { status: 400 });
    }

    const { playlist, tracks } = await importYouTubePlaylist(url, body.title);
    return NextResponse.json({ success: true, local: true, playlist, tracks });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import YouTube playlist' },
      { status: 500 },
    );
  }
}

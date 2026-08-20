/**
 * YTMusic search — search YouTube Music through the configured GraphQL contract.
 *
 * This is the YouTube Music source for the dual search engine. GraphQL
 * returns candidates with videoId, title, channel, duration, and thumbnails.
 * We normalize these into the app's internal Track model so the UI can treat
 * YouTube Music and Spotify results uniformly.
 */

import { NextResponse } from 'next/server';
import { searchYouTubeMusic } from '@/lib/youtube/search';
import { getThumbnailUrl } from '@/lib/ytmusicFormat';
import type { Track } from '@/types';
import { toUiMessage } from '@/lib/spotify/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)));

  if (!q.trim()) return NextResponse.json({ tracks: [] });

  try {
    const candidates = await searchYouTubeMusic(q, limit);
    const tracks: Track[] = candidates.map((c, i) => ({
      videoId: c.videoId,
      title: c.title,
      artist: c.channel || 'Unknown artist',
      thumbnailUrl: getThumbnailUrl(c.videoId, c.title),
      duration: c.duration,
      position: i,
    }));
    return NextResponse.json({ tracks, total: tracks.length });
  } catch (err) {
    return NextResponse.json({ error: toUiMessage(err) }, { status: 500 });
  }
}

/**
 * YTMusic search — search YouTube Music via yt-dlp and normalize results.
 *
 * This is the YTMusic source for the dual search engine. yt-dlp's flat-playlist
 * search returns candidates with videoId, title, channel, duration, and
 * thumbnails. We normalize these into the app's internal Track model so the
 * UI can treat YTMusic and Spotify results uniformly.
 *
 * Security: yt-dlp is invoked via `execFile` with an argument ARRAY — never
 * shell interpolation. The search query is passed as a single argument.
 */

import { NextResponse } from 'next/server';
import { searchYouTube } from '@/lib/ytdlp/resolver';
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
    const candidates = await searchYouTube(q, limit);
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

import { NextResponse } from 'next/server';
import { searchYouTubeMusic } from '@/lib/youtube/search';
import { getYoutubeMapping, setYoutubeMapping } from '@/lib/storage/mapping';

export const dynamic = 'force-dynamic';

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(official|video|audio|lyrics?|visualizer|topic)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreCandidate(
  candidate: { title: string; channel?: string; duration?: number },
  title: string,
  artist: string,
  duration?: number,
): number {
  const wantedTitle = normalize(title);
  const wantedArtist = normalize(artist);
  const candidateTitle = normalize(candidate.title);
  const candidateArtist = normalize(candidate.channel || '');
  let score = 0;

  if (candidateTitle === wantedTitle) score += 60;
  else if (candidateTitle.includes(wantedTitle) || wantedTitle.includes(candidateTitle)) score += 35;

  const titleWords = wantedTitle.split(' ').filter(Boolean);
  score += titleWords.filter((word) => candidateTitle.includes(word)).length * 4;

  if (wantedArtist && candidateArtist.includes(wantedArtist)) score += 30;
  else if (wantedArtist && wantedArtist.split(' ').some((word) => candidateArtist.includes(word))) score += 10;

  if (duration && candidate.duration) {
    const difference = Math.abs(duration - candidate.duration);
    if (difference <= 3) score += 20;
    else if (difference <= 10) score += 10;
    else if (difference > 45) score -= 20;
  }

  return score;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      title?: unknown;
      artist?: unknown;
      duration?: unknown;
      spotifyId?: unknown;
    };
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const artist = typeof body.artist === 'string' ? body.artist.trim() : '';
    const spotifyId = typeof body.spotifyId === 'string' ? body.spotifyId.trim() : '';
    const duration = typeof body.duration === 'number' ? body.duration : undefined;

    if (!title || !spotifyId) {
      return NextResponse.json({ error: 'Spotify track title and ID are required' }, { status: 400 });
    }

    if (!process.env.YOUTUBE_GRAPHQL_ENDPOINT || !process.env.YOUTUBE_GRAPHQL_QUERY) {
      return NextResponse.json({ error: 'YouTube matching is not configured' }, { status: 503 });
    }

    const cached = getYoutubeMapping(spotifyId);
    if (cached?.youtubeVideoId) {
      return NextResponse.json({ videoId: cached.youtubeVideoId, source: 'cache' });
    }

    const query = [artist, title].filter(Boolean).join(' ');
    const candidates = await searchYouTubeMusic(query, 20);
    const ranked = candidates
      .filter((candidate) => /^[A-Za-z0-9_-]{11}$/.test(candidate.videoId))
      .map((candidate) => ({ candidate, score: scoreCandidate(candidate, title, artist, duration) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];

    // Require a meaningful match. The player must never silently play an
    // unrelated song just because a search returned something.
    if (!best || best.score < 35) {
      return NextResponse.json({ error: 'No reliable YouTube match found' }, { status: 404 });
    }

    setYoutubeMapping({
      spotifyTrackId: spotifyId,
      youtubeVideoId: best.candidate.videoId,
      matchedTitle: best.candidate.title,
      matchedArtist: best.candidate.channel,
      duration: best.candidate.duration,
      resolvedAt: Date.now(),
      matchMethod: 'metadata',
    });

    return NextResponse.json({ videoId: best.candidate.videoId, source: 'search', score: best.score });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('GraphQL is not configured')) {
      console.error('[spotify/resolve] failed:', error);
    }
    return NextResponse.json({ error: 'Spotify track resolution failed' }, { status: 500 });
  }
}

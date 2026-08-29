/**
 * POST /api/spotify/resolve
 *
 * Resolves a Spotify track to YouTube Music using the points-based matching engine.
 */

import { NextResponse } from 'next/server';
import { matchSpotifyTrack } from '@/lib/matching/matcher';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: unknown;
      artist?: unknown;
      duration?: unknown;
      spotifyId?: unknown;
      album?: unknown;
      thumbnailUrl?: unknown;
      force?: unknown;
    };

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const artist = typeof body.artist === 'string' ? body.artist.trim() : '';
    const spotifyId = typeof body.spotifyId === 'string' ? body.spotifyId.trim() : '';
    const album = typeof body.album === 'string' ? body.album.trim() : undefined;
    const duration = typeof body.duration === 'number' ? body.duration : undefined;
    const thumbnailUrl = typeof body.thumbnailUrl === 'string' ? body.thumbnailUrl.trim() : undefined;
    const forceSearch = Boolean(body.force);

    if (!title || !spotifyId) {
      return NextResponse.json({ error: 'Spotify track title and ID are required' }, { status: 400 });
    }

    const matchResult = await matchSpotifyTrack(
      {
        id: spotifyId,
        title,
        artist,
        album,
        duration,
        thumbnailUrl,
      },
      { forceSearch },
    );

    if (!matchResult.matched || !matchResult.candidate?.videoId) {
      return NextResponse.json(
        {
          error: matchResult.rejectionReason || 'No confident YouTube Music match found',
          matchResult,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      videoId: matchResult.candidate.videoId,
      score: matchResult.score,
      confidence: matchResult.confidence,
      source: matchResult.source,
      candidate: matchResult.candidate,
      breakdown: matchResult.breakdown,
      appliedPenalties: matchResult.appliedPenalties,
      normalizedSpotifyTitle: matchResult.normalizedSpotifyTitle,
      normalizedCandidateTitle: matchResult.normalizedCandidateTitle,
      normalizedSpotifyArtist: matchResult.normalizedSpotifyArtist,
      normalizedCandidateArtist: matchResult.normalizedCandidateArtist,
      detectedSpotifyVersion: matchResult.detectedSpotifyVersion,
      detectedCandidateVersion: matchResult.detectedCandidateVersion,
    });
  } catch (error) {
    console.error('[spotify/resolve] failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Spotify track resolution failed' },
      { status: 500 },
    );
  }
}

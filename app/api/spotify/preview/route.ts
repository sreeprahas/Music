/**
 * POST /api/spotify/preview
 *
 * Phase 1 — fast playlist preview.
 *
 * Body: { url: string }
 * Returns: { playlistName, coverImage, tracks: [{ name, artists, image, duration_ms }] }
 *
 * Only fetches the public Spotify embed page — no OAuth, no credentials.
 * Frontend uses this to render a 10-track preview before the user confirms import.
 */

import { NextResponse } from 'next/server';
import { fetchEmbedPreview } from '@/lib/spotify/embed';
import { formatPreviewResponse } from '@/lib/spotify/normalize';
import { extractPlaylistId } from '@/lib/spotify/validation';
import { toUiMessage } from '@/lib/spotify/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };

    if (typeof body.url !== 'string' || body.url.length > 2000) {
      return NextResponse.json({ error: 'Missing or invalid url' }, { status: 400 });
    }

    const playlistId = extractPlaylistId(body.url);
    if (!playlistId) {
      return NextResponse.json(
        { error: 'Not a valid Spotify playlist URL. Expected: https://open.spotify.com/playlist/...' },
        { status: 400 },
      );
    }

    const embed = await fetchEmbedPreview(playlistId);
    return NextResponse.json(formatPreviewResponse(embed));
  } catch (err) {
    const message = toUiMessage(err);
    const status =
      (err as { status?: number })?.status === 404
        ? 404
        : message.includes('rate limit') || message.includes('Rate limit')
          ? 429
          : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

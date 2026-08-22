/**
 * POST /api/spotify/import
 *
 * Phase 2 — full playlist import.
 *
 * Body: { url: string }
 *
 * Streams NDJSON progress lines followed by a final result:
 *   {"type":"progress","fetched":100,"total":523}
 *   {"type":"done","playlist":{...},"tracks":[...]}
 *   {"type":"error","error":"..."}
 *
 * Moves cached preview metadata/images into real storage and downloads
 * the images and metadata for all remaining tracks.
 *
 * The guest token never leaves the server.
 * All Spotify network calls are made server-side.
 */

import { NextResponse } from 'next/server';
import { extractPlaylistId } from '@/lib/spotify/validation';
import { fetchGuestToken } from '@/lib/spotify/guestToken';
import { fetchAllPlaylistTracks, fetchPlaylistMeta } from '@/lib/spotify/apiClient';
import { toAppTrack, toAppPlaylist } from '@/lib/spotify/normalize';
import { toUiMessage } from '@/lib/spotify/errors';
import { promotePreviewToRealData } from '@/lib/spotify/previewCache';
import {
  findLocalPlaylistBySourceUrl,
  getCachedTracks,
  upsertLocalPlaylist,
  setCachedTracks,
  downloadAllTrackThumbnails,
} from '@/lib/db';

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

    // Stream progress via NDJSON
    const encoder = new TextEncoder();
    const rawUrl = body.url;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) => {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
        };

        try {
          // Obtain guest token (server-side only, never sent to client)
          const { accessToken } = await fetchGuestToken(playlistId);

          // Fetch playlist metadata
          const meta = await fetchPlaylistMeta(playlistId, accessToken);

          send({ type: 'start', playlistName: meta.name });

          // Paginate all tracks
          const rawTracks = await fetchAllPlaylistTracks(
            playlistId,
            accessToken,
            (fetched, total) => {
              send({ type: 'progress', fetched, total });
            },
          );

          // Build app models
          const localId = `spotify-${playlistId}`;
          const appTracks = rawTracks.map((t, i) => toAppTrack(t, i, localId));
          const playlist = toAppPlaylist(playlistId, meta.name, meta.image, rawUrl, appTracks);

          // 1. Move cached preview images into real data storage
          await promotePreviewToRealData(playlistId, appTracks).catch(() => {});

          // 2. Download remaining images and convert to WebP
          const tracksWithLocalThumbs = await downloadAllTrackThumbnails(appTracks);

          // 3. Persist to local database
          const stored = upsertLocalPlaylist(playlist, tracksWithLocalThumbs);
          setCachedTracks(stored.id, tracksWithLocalThumbs);

          send({ type: 'done', success: true, playlist: stored, tracks: tracksWithLocalThumbs });
        } catch (err) {
          send({ type: 'error', error: toUiMessage(err) });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: toUiMessage(err) }, { status: 500 });
  }
}

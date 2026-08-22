/**
 * POST /api/spotify/import
 *
 * Full Spotify playlist import via guest token + internal API.
 * Streams NDJSON progress, then reconciles the playlist in SQLite
 * with playlist-scoped thumbnail storage.
 *
 * Body: { url: string }
 * Stream:
 *   {"type":"start","playlistName":"..."}
 *   {"type":"progress","fetched":50,"total":100}
 *   {"type":"done","success":true,"playlist":{...},"tracks":[...]}
 *   {"type":"error","error":"..."}
 */

import { NextResponse } from 'next/server';
import { extractPlaylistId } from '@/lib/spotify/validation';
import { fetchGuestToken } from '@/lib/spotify/guestToken';
import { fetchAllPlaylistTracks, fetchPlaylistMeta } from '@/lib/spotify/apiClient';
import { toAppTrack, toAppPlaylist } from '@/lib/spotify/normalize';
import { toUiMessage } from '@/lib/spotify/errors';
import { reconcilePlaylist } from '@/lib/storage/playlists';
import { promotePreviewToPlaylistDir, getPlaylistThumbnailDir } from '@/lib/storage/thumbnails';
import path from 'path';
import { getDataDir } from '@/lib/nativeData';

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
            (fetched, total) => { send({ type: 'progress', fetched, total }); },
          );

          // Build app models
          const localId = `spotify-${playlistId}`;
          const appTracks = rawTracks.map((t, i) => toAppTrack(t, i, localId));
          const playlist = toAppPlaylist(playlistId, meta.name, meta.image, rawUrl, appTracks);

          // Promote cached preview images into playlist-scoped thumbnail dir
          const previewDir = path.join(path.resolve(getDataDir()), 'cache', 'preview');
          await promotePreviewToPlaylistDir(localId, appTracks, previewDir).catch(() => {});

          // Reconcile: transactional SQLite update + non-blocking background artwork
          const { playlist: stored, tracks } = await reconcilePlaylist(
            playlist,
            appTracks,
            meta.image || undefined,
            true, // async background artwork
          );

          // Clear transient preview cache after promotion
          const { clearPreviewCache } = await import('@/lib/spotify/previewCache');
          clearPreviewCache(playlistId);

          send({ type: 'done', success: true, playlist: stored, tracks });
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

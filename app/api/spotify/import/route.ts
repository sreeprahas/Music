/**
 * POST /api/spotify/import
 *
 * Full Spotify playlist import through one hidden Electron WebContents.
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
import {
  fetchPlaylistWithHiddenWebContents,
  toNormalizedSpotifyTrack,
} from '@/lib/spotify/webContentsProvider';
import { toAppTrack, toAppPlaylist } from '@/lib/spotify/normalize';
import { toUiMessage } from '@/lib/spotify/errors';
import { reconcilePlaylist } from '@/lib/storage/playlists';

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
    const abortController = new AbortController();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) => {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
        };

        try {
          // Electron main owns the reusable hidden renderer and serializes imports.
          const { playlist: meta, tracks: rawTracks } =
            await fetchPlaylistWithHiddenWebContents(rawUrl, {
              signal: abortController.signal,
              onProgress: (fetched, total) => send({ type: 'progress', fetched, total }),
            });
          send({ type: 'start', playlistName: meta.name });

          // Build app models with unique local ID for every import
          const localId = `sp-${playlistId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          const appTracks = rawTracks.map((track, i) =>
            toAppTrack(toNormalizedSpotifyTrack(track), i, localId),
          );
          const playlist = {
            ...toAppPlaylist(playlistId, meta.name, meta.image, rawUrl, appTracks),
            id: localId,
            syncOnOpen: false,
          };

          // Reconcile: transactional SQLite update + non-blocking artwork
          // download. The playlist and track images here come from the hidden
          // Spotify WebContents scraper.
          const { playlist: stored, tracks } = await reconcilePlaylist(
            playlist,
            appTracks,
            meta.image || undefined,
            true, // async background artwork
          );

          send({ type: 'done', success: true, playlist: stored, tracks });
        } catch (err) {
          send({ type: 'error', error: toUiMessage(err) });
        } finally {
          controller.close();
        }
      },
      cancel() {
        abortController.abort(new Error('Spotify import was canceled.'));
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

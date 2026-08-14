import { getSession, refreshAccessToken } from '@/lib/auth';
import { getPlaylistTracks } from '@/lib/ytmusicApi';
import { isDownloaded, downloadTrack } from '@/lib/downloader';
import type { DownloadProgressEvent } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  if (process.env.IS_NATIVE_BUILD === 'true') {
    return new Response('Static stub');
  }

  const { searchParams } = new URL(request.url);
  const playlistId = searchParams.get('playlistId');

  if (!playlistId) {
    return new Response('Missing playlistId', { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  let { accessToken, refreshToken, expiresAt } = session;
  if (Date.now() > expiresAt - 60_000) {
    const refreshed = await refreshAccessToken(refreshToken);
    if (refreshed) accessToken = refreshed.accessToken;
  }

  try {
    const encoder = new TextEncoder();
    // Detect client disconnect — when browser closes the connection, request.signal aborts
    const abortSignal = request.signal;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (data: DownloadProgressEvent) => {
          if (abortSignal.aborted) return;
          try {
            const encoded = encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
            controller.enqueue(encoded);
          } catch (e) {
            console.error('[download] Send error:', e);
          }
        };

        try {
          console.log(`[download] Starting download for playlist ${playlistId}`);
          const allTracks = await getPlaylistTracks(accessToken, playlistId);
          console.log(`[download] Found ${allTracks.length} total tracks`);
          const toDownload = allTracks.filter((t) => !isDownloaded(t.videoId));
          console.log(`[download] ${toDownload.length} tracks to download`);

          send({ type: 'start', total: allTracks.length, toDownload: toDownload.length });

          let processed = 0;
          let successful = 0;

          for (const track of toDownload) {
            // Stop immediately if client disconnected
            if (abortSignal.aborted) {
              console.log('[download] Client disconnected — aborting loop');
              break;
            }

            send({
              type: 'progress',
              current: processed + 1,
              total: toDownload.length,
              videoId: track.videoId,
              title: track.title,
              artist: track.artist,
              thumbnailUrl: track.thumbnailUrl,
              status: 'downloading',
            });

            try {
              await downloadTrack(track.videoId, track.title, track.artist);
              processed++;
              successful++;
              send({
                type: 'progress',
                current: processed,
                total: toDownload.length,
                videoId: track.videoId,
                title: track.title,
                artist: track.artist,
                thumbnailUrl: track.thumbnailUrl,
                status: 'done',
              });
            } catch (err: unknown) {
              processed++;
              const message = err instanceof Error ? err.message : 'Download error';
              console.error(`[api/download] Track ${track.videoId} (${track.title}) failed:`, message);
              send({
                type: 'progress',
                current: processed,
                total: toDownload.length,
                videoId: track.videoId,
                title: track.title,
                status: 'error',
                error: message,
              });
            }
          }

          if (!abortSignal.aborted) {
            console.log(`[download] Download complete. ${successful} successful, ${processed - successful} failed`);
            send({ type: 'complete', downloaded: successful });
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          console.error('[download] API error:', message, err);
          send({ type: 'error', message });
        } finally {
          controller.close();
        }
      },
      cancel() {
        // Called when client closes the connection — nothing extra needed since abortSignal handles it
        console.log('[download] Stream cancelled by client');
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[download] Fatal error:', message, err);
    return new Response(JSON.stringify({ type: 'error', message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: DownloadProgressEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // controller already closed
        }
      };

      try {
        const allTracks = await getPlaylistTracks(accessToken, playlistId);
        const toDownload = allTracks.filter((t) => !isDownloaded(t.videoId));

        send({ type: 'start', total: allTracks.length, toDownload: toDownload.length });

        let processed = 0;
        let successful = 0;

        for (const track of toDownload) {
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

        send({ type: 'complete', downloaded: successful });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        send({ type: 'error', message });
      } finally {
        controller.close();
      }
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
}

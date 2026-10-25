import { getCachedTracks } from '@/lib/db';
import { isDownloaded, downloadTrack } from '@/lib/downloader';
import { MusicService, MusicServiceError } from '@/lib/music/spotiflac';
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

  // Optional: restrict to specific videoIds (used for retry-failed)
  const videoIdsParam = searchParams.get('videoIds');
  const filterVideoIds = videoIdsParam
    ? new Set(videoIdsParam.split(',').map((s) => s.trim()).filter(Boolean))
    : null;

  try {
    const encoder = new TextEncoder();
    const abortSignal = request.signal;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (data: DownloadProgressEvent & { trackTitle?: string; trackError?: string }) => {
          if (abortSignal.aborted) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch (e) {
            console.error('[download] Send error:', e);
          }
        };

        try {
          console.log(`[download] Starting download for playlist ${playlistId}`);
          const allTracks = getCachedTracks(playlistId) || [];
          console.log(`[download] Found ${allTracks.length} total tracks`);

          let toDownload = allTracks.filter((t) => t.source === 'spotify' ? !t.downloaded : !isDownloaded(t.videoId));
          if (filterVideoIds) {
            toDownload = toDownload.filter((t) => filterVideoIds.has(t.videoId));
          }

          console.log(`[download] ${toDownload.length} tracks to download`);
          send({ type: 'start', total: allTracks.length, toDownload: toDownload.length });

          let processed = 0;
          let successful = 0;

          for (const track of toDownload) {
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
              if (track.source === 'spotify') {
                const spotifyId = track.sourceTrackId || track.videoId;
                const existingAudio = await MusicService.resolveLocalAudio({ spotifyId, title: track.title });
                const job = existingAudio ? null : await MusicService.queueDownload(spotifyId, track.title);
                const completedJob = job ? await MusicService.waitForDownload(job.id) : null;
                const outputAudio = await MusicService.resolveLocalAudio({ spotifyId, title: track.title });
                if (!outputAudio || completedJob?.status.toLowerCase() === 'failed') throw new Error(completedJob?.error || 'Completed file was not found in the shared audio directory.');
              } else {
                await downloadTrack(track.videoId, track.title, track.artist, abortSignal);
              }
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
              const message = err instanceof MusicServiceError ? err.code : err instanceof Error ? err.message : 'Download error';
              console.error(`[api/download] Track ${track.videoId} (${track.title}) failed:`, message);
              send({
                type: 'progress',
                current: processed,
                total: toDownload.length,
                videoId: track.videoId,
                title: track.title,
                trackTitle: track.title,
                trackError: message,
                status: 'error',
                error: message,
              });
            }
          }

          if (!abortSignal.aborted) {
            console.log(`[download] Complete. ${successful} ok, ${processed - successful} failed`);
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
      cancel() {},
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

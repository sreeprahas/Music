import fs from 'fs';
import { getMp3Path, isDownloaded } from '@/lib/downloader';
import { getAudioMimeType, isUsableAudio, resolveAudioStore, getAudioPath } from '@/lib/cache/audio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/mp3?v=<videoId>&store=downloads|cache
 *
 * Streams a locally stored audio file with full Range support.
 *  - store=downloads (default) → explicit user downloads
 *  - store=cache               → automatically cached streamed songs
 */
export async function GET(request: Request): Promise<Response> {
  if (process.env.IS_NATIVE_BUILD === 'true') {
    return new Response('Static stub');
  }

  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('v') || searchParams.get('videoId');
  const store = resolveAudioStore(searchParams.get('store'));

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return new Response('Invalid videoId', { status: 400 });
  }

  const isLocal = store === 'cache' ? isUsableAudio(videoId, 'cache') : isDownloaded(videoId);
  if (!isLocal) {
    return new Response('Track not found', { status: 404 });
  }

  const filePath = store === 'cache' ? getAudioPath(videoId, 'cache') : getMp3Path(videoId);
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const rangeHeader = request.headers.get('range');

  const headers: Record<string, string> = {
    'Content-Type': getAudioMimeType(videoId, store),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
  };

  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (!match) return new Response('Invalid range', { status: 416 });
    const start = match[1] ? parseInt(match[1], 10) : Math.max(0, fileSize - parseInt(match[2], 10));
    const end = match[1] && match[2] ? parseInt(match[2], 10) : fileSize - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= fileSize) return new Response('Invalid range', { status: 416 });
    const boundedEnd = Math.min(end, fileSize - 1);
    const chunkSize = boundedEnd - start + 1;

    const nodeStream = fs.createReadStream(filePath, { start, end: boundedEnd });
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk: Buffer | string) =>
          controller.enqueue(chunk instanceof Buffer ? chunk : Buffer.from(chunk))
        );
        nodeStream.on('end', () => controller.close());
        nodeStream.on('error', (err) => controller.error(err));
      },
      cancel() { nodeStream.destroy(); },
    });

    return new Response(webStream, {
      status: 206,
      headers: {
        ...headers,
        'Content-Range': `bytes ${start}-${boundedEnd}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
      },
    });
  }

  const nodeStream = fs.createReadStream(filePath);
  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer | string) =>
        controller.enqueue(chunk instanceof Buffer ? chunk : Buffer.from(chunk))
      );
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (err) => controller.error(err));
    },
    cancel() { nodeStream.destroy(); },
  });

  return new Response(webStream, {
    headers: { ...headers, 'Content-Length': String(fileSize), 'Accept-Ranges': 'bytes' },
  });
}

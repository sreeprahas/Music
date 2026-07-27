import fs from 'fs';
import { getMp3Path, isDownloaded } from '@/lib/downloader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  if (process.env.IS_NATIVE_BUILD === 'true') {
    return new Response('Static stub');
  }

  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return new Response('Invalid videoId', { status: 400 });
  }

  if (!isDownloaded(videoId)) {
    return new Response('Track not found', { status: 404 });
  }

  const filePath = getMp3Path(videoId);
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const rangeHeader = request.headers.get('range');

  if (rangeHeader) {
    const parts = rangeHeader.replace('bytes=', '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    const nodeStream = fs.createReadStream(filePath, { start, end });
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk: Buffer | string) =>
          controller.enqueue(chunk instanceof Buffer ? chunk : Buffer.from(chunk))
        );
        nodeStream.on('end', () => controller.close());
        nodeStream.on('error', (err) => controller.error(err));
      },
      cancel() {
        nodeStream.destroy();
      },
    });

    return new Response(webStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': 'audio/mpeg',
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
    cancel() {
      nodeStream.destroy();
    },
  });

  return new Response(webStream, {
    headers: {
      'Content-Length': String(fileSize),
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes',
    },
  });
}

/**
 * GET /api/stream/live?v=<videoId>
 *
 * Local caching stream proxy.
 *
 * The player plays from this endpoint when neither the downloads store nor the
 * cache store has the song. The endpoint:
 *
 *   1. Resolves the direct YouTube audio URL (coalesced via the shared
 *      in-memory stream URL cache in lib/downloader.ts).
 *   2. Streams the audio to the <audio> element, forwarding Range requests so
 *      seeking works exactly like a direct stream.
 *   3. Simultaneously TEES the received bytes into the cache store
 *      (lib/cache/streamCache.ts). When the full file has been received the
 *      partial file is promoted to the cache and every later playback of this
 *      global song is served from disk — across app restarts.
 *
 * Only a clean, complete transfer (no Range or `bytes=0-`) is persisted, so the
 * cache never contains truncated audio. Partial transfers are discarded.
 */
import fs from 'fs';
import { getStreamUrl } from '@/lib/downloader';
import {
  beginCacheWrite,
  writeCacheChunk,
  completeCacheWrite,
  abortCacheWrite,
  resolveLocalAudioStore,
} from '@/lib/cache/streamCache';
import { getAudioPath, getAudioMimeType } from '@/lib/cache/audio';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function sanitizeMeta(value: string | null): string | undefined {
  const trimmed = (value || '').trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 300);
}

function serveLocalFile(videoId: string, store: 'downloads' | 'cache'): Response | null {
  if (!resolveLocalAudioStore(videoId)) return null;
  const filePath = getAudioPath(videoId, store);
  if (!fs.existsSync(filePath)) return null;

  const stat = fs.statSync(filePath);
  const nodeStream = fs.createReadStream(filePath);
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer | string) =>
        controller.enqueue(chunk instanceof Buffer ? chunk : Buffer.from(chunk)),
      );
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (err) => controller.error(err));
    },
    cancel() { nodeStream.destroy(); },
  });

  return new Response(webStream, {
    headers: {
      'Content-Type': getAudioMimeType(videoId, store),
      'Accept-Ranges': 'bytes',
      'Content-Length': String(stat.size),
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = (searchParams.get('videoId') || searchParams.get('v') || '').trim();

  if (!videoId || !VIDEO_ID.test(videoId)) {
    return new Response('Missing or invalid videoId', { status: 400 });
  }

  // A local copy may have appeared (another playback finished caching it).
  // Prefer it over the network — cache lookups always win.
  const localStore = resolveLocalAudioStore(videoId);
  if (localStore) {
    const local = serveLocalFile(videoId, localStore);
    if (local) return local;
  }

  // Optional display metadata forwarded by the player so the cached song can
  // be listed with title/artist later. Never used for playback itself.
  const cacheMeta = {
    title: sanitizeMeta(searchParams.get('title')),
    artist: sanitizeMeta(searchParams.get('artist')),
    thumbnailUrl: sanitizeMeta(searchParams.get('thumbnailUrl')),
  };

  let upstreamUrl: string;
  try {
    upstreamUrl = await getStreamUrl(videoId, request.signal);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stream unavailable';
    console.error(`[api/stream/live] Failed to get stream for ${videoId}:`, message);
    return new Response(message, { status: 503 });
  }

  if (request.signal.aborted) {
    return new Response('Cancelled', { status: 499 });
  }

  const rangeHeader = request.headers.get('range');
  // Only a transfer that starts at byte 0 and runs to the end can populate the
  // cache. Range requests (seeking) are proxied verbatim instead.
  const rangeMatch = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;
  // Cache when: no Range header, OR a suffix range (bytes=-N), OR a range
  // starting at byte 0 (bytes=0- or bytes=0-N). Browsers typically send
  // bytes=0- on first play when the server advertises Accept-Ranges.
  const canCache = !rangeMatch
    || (rangeMatch[1] === '' && rangeMatch[2] === '')
    || rangeMatch[1] === '0';
  console.log(`[api/stream/live] videoId=${videoId} range=${rangeHeader || 'none'} canCache=${canCache}`);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: rangeHeader ? { Range: rangeHeader } : undefined,
      signal: request.signal,
    });
  } catch (err) {
    if (request.signal.aborted) return new Response('Cancelled', { status: 499 });
    const message = err instanceof Error ? err.message : 'Upstream fetch failed';
    console.error(`[api/stream/live] Upstream fetch failed for ${videoId}:`, message);
    return new Response(message, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(`Upstream error (${upstream.status})`, { status: upstream.status === 416 ? 416 : 502 });
  }

  const upstreamMime = (upstream.headers.get('content-type') || '').split(';')[0].trim();

  const headers: Record<string, string> = {
    'Content-Type': upstreamMime || 'audio/webm',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  };
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) headers['Content-Length'] = contentLength;
  const contentRange = upstream.headers.get('content-range');
  if (contentRange) headers['Content-Range'] = contentRange;

  // Already cached by a concurrent playback → just proxy, nothing to tee.
  let cacheHandle = canCache ? beginCacheWrite(videoId, upstreamMime, cacheMeta) : null;
  let finished = false;

  const reader = upstream.body.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          if (!finished) {
            finished = true;
            if (cacheHandle) completeCacheWrite(cacheHandle);
          }
          controller.close();
          return;
        }
        if (value) {
          if (cacheHandle) writeCacheChunk(cacheHandle, value);
          controller.enqueue(value);
        }
      } catch (err) {
        if (!finished) {
          finished = true;
          if (cacheHandle) abortCacheWrite(cacheHandle);
          cacheHandle = null;
        }
        controller.error(err);
      }
    },
    cancel() {
      finished = true;
      if (cacheHandle) {
        abortCacheWrite(cacheHandle);
        cacheHandle = null;
      }
      void reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, { status: upstream.status, headers });
}
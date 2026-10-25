// @ts-nocheck
/**
 * GET /api/stream/live?v=<videoId>
 *
 * Local caching stream proxy with resolver-based fallback on upstream 403.
 * PO-token and yt-dlp logic lives in lib/youtube/resolver.ts — not here.
 */
import { log, logError } from '@/lib/log';
import fs from 'fs';
import { resolvePlayableStream, invalidateResolverCache } from '@/lib/youtube/resolver';
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

function sanitizeMeta(value) {
  const trimmed = (value || '').trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 300);
}

function serveLocalFile(videoId, store) {
  if (!resolveLocalAudioStore(videoId)) return null;
  const filePath = getAudioPath(videoId, store);
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  const nodeStream = fs.createReadStream(filePath);
  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk) =>
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

async function fetchUpstream(url, videoId, request) {
  const rangeHeader = request.headers.get('range');
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Referer': 'https://www.youtube.com/',
  };
  if (rangeHeader) headers['Range'] = rangeHeader;
  const safeUrl = (() => { try { return new URL(url).hostname; } catch { return '(redacted)'; } })();
  log('[api/stream/live] upstream request videoId=' + videoId + ' host=' + safeUrl);
  return fetch(url, { headers, signal: request.signal });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const videoId = (searchParams.get('videoId') || searchParams.get('v') || '').trim();

  if (!videoId || !VIDEO_ID.test(videoId)) {
    return new Response('Missing or invalid videoId', { status: 400 });
  }

  // 1. Local cache — always wins, no network needed
  const localStore = resolveLocalAudioStore(videoId);
  if (localStore) {
    const local = serveLocalFile(videoId, localStore);
    if (local) {
      log('[api/stream/live] local hit videoId=' + videoId + ' store=' + localStore);
      return local;
    }
  }

  const cacheMeta = {
    title: sanitizeMeta(searchParams.get('title')),
    artist: sanitizeMeta(searchParams.get('artist')),
    thumbnailUrl: sanitizeMeta(searchParams.get('thumbnailUrl')),
  };

  const rangeHeader = request.headers.get('range');
  const rangeMatch = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;
  const canCache = !rangeMatch
    || (rangeMatch[1] === '' && rangeMatch[2] === '')
    || rangeMatch[1] === '0';
  log('[api/stream/live] request videoId=' + videoId + ' range=' + (rangeHeader || 'none') + ' canCache=' + canCache);

  // 2. Resolve via primary → fallback resolver (with URL exclusion for 403 bypass)
  const streamStart = Date.now();
  const excludeUrls = new Set();
  let playable;
  let attempt = 0;

  while (attempt < 2) {
    attempt++;
    try {
      playable = await resolvePlayableStream(videoId, request.signal, excludeUrls.size > 0 ? excludeUrls : undefined);
      break;
    } catch (err) {
      if (attempt >= 2) {
        logError('[api/stream/live] resolve failed after fallback videoId=' + videoId + ': ' + (err instanceof Error ? err.message : String(err)));
        return new Response(err instanceof Error ? err.message : 'Stream unavailable', { status: 503 });
      }
    }
  }

  if (request.signal.aborted) return new Response('Cancelled', { status: 499 });
  if (!playable) return new Response('Stream unavailable', { status: 503 });

  // 3. Attempt upstream fetch
  let upstream;
  try {
    upstream = await fetchUpstream(playable.url, videoId, request);
  } catch (err) {
    if (request.signal.aborted) return new Response('Cancelled', { status: 499 });
    logError('[api/stream/live] upstream fetch threw videoId=' + videoId + ': ' + (err instanceof Error ? err.message : String(err)));
    return new Response('Upstream fetch failed', { status: 502 });
  }

  log('[api/stream/live] upstream status=' + upstream.status + ' videoId=' + videoId + ' ct=' + (upstream.headers.get('content-type') || '?') + ' cl=' + (upstream.headers.get('content-length') || '?'));

  // 4. If 403: exclude this URL and retry through resolver (yt-dlp fallback)
  if (upstream.status === 403) {
    log('[api/stream/live] UPSTREAM_403 videoId=' + videoId + ' source=' + playable.source + ' — retrying with URL exclusion');
    excludeUrls.add(playable.url);
    invalidateResolverCache(videoId);

    const cachedLocal = resolveLocalAudioStore(videoId);
    if (cachedLocal) {
      const cachedFile = serveLocalFile(videoId, cachedLocal);
      if (cachedFile) {
        log('[api/stream/live] serving cached after 403 videoId=' + videoId);
        return cachedFile;
      }
    }

    try {
      const fallback = await resolvePlayableStream(videoId, request.signal, excludeUrls);
      log('[api/stream/live] fallback resolved videoId=' + videoId + ' source=' + fallback.source);
      if (request.signal.aborted) return new Response('Cancelled', { status: 499 });
      const upstream2 = await fetchUpstream(fallback.url, videoId, request);
      if (!upstream2.ok && upstream2.status !== 206) {
        logError('[api/stream/live] fallback upstream failed status=' + upstream2.status + ' videoId=' + videoId);
        return new Response('LIVE_STREAM_UNAVAILABLE (upstream=' + upstream2.status + ')', { status: 503 });
      }
      upstream = upstream2;
      playable = fallback;
    } catch (err) {
      logError('[api/stream/live] fallback resolve failed videoId=' + videoId + ': ' + (err instanceof Error ? err.message : String(err)));
      return new Response('LIVE_STREAM_UNAVAILABLE', { status: 503 });
    }
  }

  if (!upstream.ok && upstream.status !== 206) {
    logError('[api/stream/live] upstream blocked status=' + upstream.status + ' videoId=' + videoId);
    return new Response('LIVE_STREAM_UNAVAILABLE (upstream=' + upstream.status + ')', { status: 503 });
  }

  if (!upstream.body) {
    logError('[api/stream/live] upstream has no body videoId=' + videoId + ' status=' + upstream.status);
    return new Response('Upstream returned no body', { status: 502 });
  }

  const upstreamMime = (upstream.headers.get('content-type') || '').split(';')[0].trim();
  const headers = {
    'Content-Type': upstreamMime || 'audio/webm',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  };
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) headers['Content-Length'] = contentLength;
  const contentRange = upstream.headers.get('content-range');
  if (contentRange) headers['Content-Range'] = contentRange;

  let cacheHandle = canCache ? beginCacheWrite(videoId, upstreamMime, cacheMeta) : null;
  let finished = false;
  let firstByteLogged = false;

  const reader = upstream.body.getReader();
  const stream = new ReadableStream({
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
          if (!firstByteLogged) {
            firstByteLogged = true;
            log('[api/stream/live] first byte videoId=' + videoId + ' elapsed=' + (Date.now() - streamStart) + 'ms source=' + playable.source);
          }
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
      if (cacheHandle) { abortCacheWrite(cacheHandle); cacheHandle = null; }
      void reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, { status: upstream.status, headers });
}

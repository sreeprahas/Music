// @ts-nocheck
/**
 * lib/youtube/resolver.ts
 */
import { log, logWarn } from '../log';
import { getStreamInfo } from './innertube';
import { execYtDlp } from './ytdlp';
import { generatePoToken, initBotGuardVM } from './po';

export type StreamSource = 'youtube-js' | 'youtube-js-po' | 'yt-dlp-provider' | 'yt-dlp';
export interface PlayableStream { url: string; mimeType?: string; bitrate?: number; contentLength?: number; duration?: number; source: StreamSource; client?: string; expiresAt?: number; }
export enum ResolverError { NO_YOUTUBE_MATCH='NO_YOUTUBE_MATCH', PO_TOKEN_FAILED='PO_TOKEN_FAILED', PRIMARY_RESOLVER_FAILED='PRIMARY_RESOLVER_FAILED', YTDLP_PROVIDER_UNAVAILABLE='YTDLP_PROVIDER_UNAVAILABLE', YTDLP_FAILED='YTDLP_FAILED', UPSTREAM_403='UPSTREAM_403', LIVE_STREAM_UNAVAILABLE='LIVE_STREAM_UNAVAILABLE' }

const streamCache = new Map<string, { info: PlayableStream; expiresAt: number }>();
const inFlight = new Map<string, Promise<PlayableStream>>();
let poInitAttempted = false;
let poTokenAvailable = false;
function nowMs() { return Date.now(); }
function safeHost(u) { try { return new URL(u).hostname; } catch { return '(redacted)'; } }

export async function initPoTokenSystem() {
  if (poInitAttempted) return poTokenAvailable;
  poInitAttempted = true;
  try { poTokenAvailable = await initBotGuardVM(); log('[po] init=' + poTokenAvailable); } catch (e) { logWarn('[po] init failed: ' + (e instanceof Error ? e.message : String(e))); poTokenAvailable = false; }
  return poTokenAvailable;
}

export function invalidateResolverCache(videoId) { streamCache.delete(videoId); }
export function hasCachedPlayableStream(videoId) { const c = streamCache.get(videoId); return !!c && c.expiresAt > nowMs(); }

export async function resolvePlayableStream(videoId, signal, excludeUrls) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('Invalid video ID');
  const cached = streamCache.get(videoId);
  if (cached && cached.expiresAt > nowMs()) {
    if (!excludeUrls || !excludeUrls.has(cached.info.url)) {
      log('[stream] cache hit ' + videoId + ' source=' + cached.info.source);
      return cached.info;
    }
    log('[stream] cache excluded ' + videoId + ' host=' + safeHost(cached.info.url));
    streamCache.delete(videoId);
  }
  const existing = inFlight.get(videoId);
  if (existing) { log('[stream] in-flight dedup ' + videoId); return existing; }
  const res = resolveInternal(videoId, signal, excludeUrls);
  inFlight.set(videoId, res);
  try { const result = await res; streamCache.set(videoId, { info: result, expiresAt: result.expiresAt || nowMs() + 900000 }); return result; }
  finally { inFlight.delete(videoId); }
}

async function resolveInternal(videoId, signal, excludeUrls) {
  const t0 = Date.now();
  if (signal && signal.aborted) throw new Error('Cancelled');
  const poReady = await initPoTokenSystem();
  if (poReady) {
    try {
      const ts = Date.now();
      const po = await generatePoToken(videoId);
      log('[stream] PO token ready ' + videoId + ' has=' + !!po + ' ms=' + (Date.now()-ts));
      const info = await getStreamInfo(videoId, signal, po || undefined);
      if (!excludeUrls || !excludeUrls.has(info.url)) {
        log('[stream] primary ok ' + videoId + ' source=youtube-js-po ms=' + (Date.now()-t0));
        return { url: info.url, mimeType: info.mimeType, bitrate: info.bitrate, contentLength: info.contentLength, source: 'youtube-js-po', expiresAt: info.expiresAt };
      }
      log('[stream] primary(po) excluded ' + videoId + ' host=' + safeHost(info.url));
    } catch (e) { logWarn('[stream] PO path failed ' + videoId + ': ' + (e instanceof Error ? e.message : String(e))); if (signal && signal.aborted) throw new Error('Cancelled'); }
  }
  try {
    const info = await getStreamInfo(videoId, signal);
    if (!excludeUrls || !excludeUrls.has(info.url)) {
      log('[stream] primary ok ' + videoId + ' source=youtube-js ms=' + (Date.now()-t0));
      return { url: info.url, mimeType: info.mimeType, bitrate: info.bitrate, contentLength: info.contentLength, source: 'youtube-js', expiresAt: info.expiresAt };
    }
    log('[stream] primary excluded ' + videoId + ' host=' + safeHost(info.url));
  } catch (e) { logWarn('[stream] primary failed ' + videoId + ': ' + (e instanceof Error ? e.message : String(e))); if (signal && signal.aborted) throw new Error('Cancelled'); }
  log('[stream] fallback yt-dlp start ' + videoId);
  try {
    const url = await resolveYtDlpFallback(videoId, signal);
    log('[stream] fallback ok ' + videoId + ' source=yt-dlp');
    return { url, mimeType: 'audio/webm', source: 'yt-dlp', expiresAt: Date.now()+1200000 };
  } catch (e) { throw new Error(ResolverError.LIVE_STREAM_UNAVAILABLE + ': ' + (e instanceof Error ? e.message : String(e))); }
}

async function resolveYtDlpFallback(videoId, signal) {
  const args = ['--extractor-args','youtube:player_client=android,web','--print','%(direct_url)s','--no-playlist','--no-warnings','--no-part','--no-mtime','https://www.youtube.com/watch?v='+videoId];
  const r = await execYtDlp({ args, signal, timeoutMs: 30000 });
  const url = r.stdout.trim();
  if (!url || url.length < 10) throw new Error('yt-dlp empty URL');
  return url;
}

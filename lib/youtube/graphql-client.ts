import { GraphQlClient } from '@/lib/graphql/client';
import { YouTubeResolutionError } from '@/lib/spotify/errors';

export interface YouTubeCandidate {
  videoId: string;
  playlistItemId?: string;
  title: string;
  channel?: string;
  album?: string;
  duration?: number;
  thumbnails?: string[];
  viewCount?: number;
  relevance?: number;
}

export interface ResolvedAudio {
  videoId: string;
  streamUrl: string;
  mimeType: string;
  bitrate?: number;
  contentLength?: number;
  expiresAt?: number;
}

const transport = new GraphQlClient({
  serviceName: 'youtube',
  endpoint: process.env.YOUTUBE_GRAPHQL_ENDPOINT,
  query: process.env.YOUTUBE_GRAPHQL_QUERY,
});

/** GraphQL-only YouTube adapter. The configured query document defines the provider schema. */
export class YouTubeGraphQlClient {
  async search(query: string, limit = 20, signal?: AbortSignal): Promise<YouTubeCandidate[]> {
    const data = await transport.execute<unknown>('search', { query: query.trim(), limit }, signal);
    return collectCandidates(data).slice(0, Math.max(1, limit));
  }

  async player(videoId: string, signal?: AbortSignal): Promise<ResolvedAudio> {
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new YouTubeResolutionError('Invalid YouTube video ID');
    const data = await transport.execute<any>('player', { videoId }, signal);
    const stream = findStream(data);
    if (!stream?.url) throw new YouTubeResolutionError('GraphQL playback response did not include a playable stream URL');
    const parsed = safeUrl(stream.url);
    const expires = Number(parsed?.searchParams.get('expire') || stream.expiresAt || 0);
    return {
      videoId,
      streamUrl: stream.url,
      mimeType: String(stream.mimeType || 'audio/mp4').split(';', 1)[0],
      bitrate: Number(stream.bitrate || 0) || undefined,
      contentLength: Number(stream.contentLength || 0) || undefined,
      expiresAt: expires > 10_000_000_000 ? expires : expires ? expires * 1000 : undefined,
    };
  }

  async playlistPage(playlistId: string, cursor?: string, signal?: AbortSignal): Promise<{ items: YouTubeCandidate[]; continuation?: string; title?: string }> {
    const data = await transport.execute<any>('playlist', { playlistId, cursor }, signal);
    const page = findFirstObject(data, ['playlist', 'playlistPage', 'playlistTracks']) || data;
    const items = collectCandidates(page);
    const pageInfo = findFirstObject(page, ['pageInfo', 'pagination']) || {};
    const continuation = firstString(pageInfo.endCursor, pageInfo.nextCursor, page.nextCursor, page.continuation, page.next);
    const title = firstString(page.title, page.name, page.playlist?.title, page.playlist?.name);
    return { items, continuation, title };
  }
}

function collectCandidates(value: unknown): YouTubeCandidate[] {
  const out: YouTubeCandidate[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const item = node as Record<string, any>;
    const videoId = firstString(item.videoId, item.id, item.video?.id);
    const title = firstString(item.title, item.name, item.video?.title);
    if (videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) && title && !out.some((candidate) => candidate.videoId === videoId)) {
      out.push({
        videoId,
        playlistItemId: firstString(item.playlistItemId, item.itemId),
        title,
        channel: firstString(item.channel, item.artist, item.author, item.owner?.name),
        album: firstString(item.album),
        duration: numberValue(item.duration, item.durationSeconds, item.lengthSeconds),
        thumbnails: collectThumbnails(item.thumbnails || item.thumbnail),
        viewCount: numberValue(item.viewCount),
        relevance: out.length,
      });
    }
    Object.values(item).forEach(walk);
  };
  walk(value);
  return out;
}

function findStream(value: unknown): Record<string, any> | undefined {
  let found: Record<string, any> | undefined;
  const walk = (node: unknown) => {
    if (found || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const item = node as Record<string, any>;
    const url = firstString(item.url, item.streamUrl, item.audioUrl);
    const mime = firstString(item.mimeType, item.mime);
    if (url && (!mime || mime.startsWith('audio/'))) { found = { ...item, url }; return; }
    Object.values(item).forEach(walk);
  };
  walk(value);
  return found;
}

function findFirstObject(value: any, paths: string[]): Record<string, any> | undefined {
  for (const path of paths) {
    let current = value;
    for (const part of path.split('.')) current = current?.[part];
    if (current && typeof current === 'object' && !Array.isArray(current)) return current;
  }
  return undefined;
}
function firstString(...values: unknown[]): string | undefined { return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim(); }
function numberValue(...values: unknown[]): number | undefined { const value = values.find((item) => Number.isFinite(Number(item))); return value === undefined ? undefined : Number(value); }
function collectThumbnails(value: any): string[] { return Array.isArray(value) ? value.map((item) => typeof item === 'string' ? item : item?.url).filter((item): item is string => Boolean(item)) : value?.url ? [String(value.url)] : []; }
function safeUrl(value: string): URL | undefined { try { return new URL(value); } catch { return undefined; } }

export const youtubeGraphQl = new YouTubeGraphQlClient();

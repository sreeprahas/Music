/**
 * lib/youtube/search.ts
 *
 * YouTube Music search using persistent Python sidecar.
 * Handles LRU + persistent caching and response normalization.
 */

import { cacheKey } from '@/lib/cache/keys';
import { LruCache } from '@/lib/cache/lru';
import { getPersistent, setPersistent } from '@/lib/cache/persistent';
import { youtubeSidecar } from './sidecar-client';
import { toYouTubeCandidate } from './adapter';
import type { YouTubeCandidate } from './types';

const memory = new LruCache<YouTubeCandidate[]>(256);
const TTL = 60 * 60 * 1000;

export interface SearchOptions {
  filter?: 'songs' | 'videos' | 'albums' | 'artists' | 'playlists';
  scope?: 'library' | 'uploads';
  limit?: number;
  ignoreSpelling?: boolean;
}

export async function searchYouTubeMusic(
  query: string,
  limit = 20,
  signal?: AbortSignal,
  options: SearchOptions = {},
): Promise<YouTubeCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const filter = options.filter || 'songs';
  const effectiveLimit = Math.max(1, Math.min(100, limit));
  const key = `${cacheKey.youtubeSearch(trimmed, effectiveLimit)}:${filter}`;

  const memoryHit = memory.get(key);
  if (memoryHit) return memoryHit;

  const persistentHit = getPersistent<YouTubeCandidate[]>(key);
  if (persistentHit) {
    memory.set(key, persistentHit, TTL);
    return persistentHit;
  }

  const response = await youtubeSidecar.execute<{ results: any[]; total: number }>(
    'search',
    {
      query: trimmed,
      filter,
      scope: options.scope,
      limit: effectiveLimit,
      ignore_spelling: options.ignoreSpelling,
    },
    15_000,
    signal,
  );

  const rawList = Array.isArray(response?.results) ? response.results : [];
  const results: YouTubeCandidate[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < rawList.length; i++) {
    const candidate = toYouTubeCandidate(rawList[i], i);
    if (candidate && !seenIds.has(candidate.videoId)) {
      seenIds.add(candidate.videoId);
      results.push(candidate);
    }
  }

  const finalized = results.slice(0, effectiveLimit);
  memory.set(key, finalized, TTL);
  setPersistent(key, finalized, TTL);

  return finalized;
}

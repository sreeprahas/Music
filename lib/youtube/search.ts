import { cacheKey } from '@/lib/cache/keys';
import { LruCache } from '@/lib/cache/lru';
import { getPersistent, setPersistent } from '@/lib/cache/persistent';
import { youtubeGraphQl, type YouTubeCandidate } from './graphql-client';

const memory = new LruCache<YouTubeCandidate[]>(256);
const TTL = 60 * 60 * 1000;

export async function searchYouTubeMusic(query: string, limit = 20, signal?: AbortSignal): Promise<YouTubeCandidate[]> {
  const key = cacheKey.youtubeSearch(query, limit);
  const memoryHit = memory.get(key);
  if (memoryHit) return memoryHit;
  const persistentHit = getPersistent<YouTubeCandidate[]>(key);
  if (persistentHit) { memory.set(key, persistentHit, TTL); return persistentHit; }
  const results = await youtubeGraphQl.search(query, limit, signal);
  memory.set(key, results, TTL);
  setPersistent(key, results, TTL);
  return results;
}

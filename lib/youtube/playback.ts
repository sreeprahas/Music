import { youtubeGraphQl, type ResolvedAudio } from './graphql-client';

const memory = new Map<string, ResolvedAudio>();

export async function resolvePlayback(videoId: string, signal?: AbortSignal): Promise<ResolvedAudio> {
  const cached = memory.get(videoId);
  if (cached && (!cached.expiresAt || cached.expiresAt > Date.now() + 30_000)) return cached;
  const resolved = await youtubeGraphQl.player(videoId, signal);
  memory.set(videoId, resolved);
  return resolved;
}

export function clearPlayback(videoId?: string): void {
  if (videoId) memory.delete(videoId); else memory.clear();
}

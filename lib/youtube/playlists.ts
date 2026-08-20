import { youtubeGraphQl, type YouTubeCandidate } from './graphql-client';

export async function getAllYouTubePlaylistTracks(playlistId: string, signal?: AbortSignal): Promise<{ title?: string; items: YouTubeCandidate[] }> {
  const items: YouTubeCandidate[] = [];
  let continuation: string | undefined;
  let title: string | undefined;
  do {
    const page = await youtubeGraphQl.playlistPage(playlistId, continuation, signal);
    if (!title) title = page.title;
    for (const item of page.items) if (!items.some((existing) => existing.videoId === item.videoId)) items.push(item);
    continuation = page.continuation;
  } while (continuation);
  return { title, items };
}

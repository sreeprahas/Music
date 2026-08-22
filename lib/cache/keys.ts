export const cacheKey = {
  youtubeSearch: (query: string, limit: number) =>
    `youtube:search:${query.trim().toLocaleLowerCase()}:${limit}`,
  youtubeVideo: (id: string) => `youtube:video:${id}`,
  match: (id: string) => `match:${id}`,
  override: (id: string) => `override:${id}`,
};

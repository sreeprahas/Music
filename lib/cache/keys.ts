export const cacheKey = {
  spotifySearch: (query: string, limit: number) => `spotify:search:${query.trim().toLocaleLowerCase()}:${limit}`,
  spotifyTrack: (id: string) => `spotify:track:${id}`,
  spotifyAlbum: (id: string) => `spotify:album:${id}`,
  spotifyArtist: (id: string) => `spotify:artist:${id}`,
  spotifyPlaylist: (id: string) => `spotify:playlist:${id}`,
  spotifyPlaylistTracks: (id: string) => `spotify:playlist-tracks:${id}`,
  spotifyProfile: () => 'spotify:profile',
  spotifyHome: () => 'spotify:home',
  youtubeSearch: (query: string, limit: number) => `youtube:search:${query.trim().toLocaleLowerCase()}:${limit}`,
  youtubeVideo: (id: string) => `youtube:video:${id}`,
  match: (id: string) => `match:${id}`,
  override: (id: string) => `override:${id}`,
};

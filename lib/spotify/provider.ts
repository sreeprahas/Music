import type { CreatePlaylistInput, SpotifyAlbum, SpotifyArtist, SpotifyHomeData, SpotifyPaging, SpotifyPlaylist, SpotifyPlaylistItem, SpotifySearchResult, SpotifyTrack, SpotifyUser } from './models';

export interface SpotifySearchOptions { types?: Array<'track' | 'artist' | 'album' | 'playlist'>; limit?: number; offset?: number; }

/** Application-owned contract. Concrete providers never escape this boundary. */
export interface SpotifyProvider {
  readonly name: string;
  search(query: string, options?: SpotifySearchOptions): Promise<SpotifySearchResult>;
  getTrack(id: string, fresh?: boolean): Promise<SpotifyTrack>;
  getArtist(id: string, fresh?: boolean): Promise<SpotifyArtist>;
  getAlbum(id: string, fresh?: boolean): Promise<{ album: SpotifyAlbum; items: SpotifyPlaylistItem[] }>;
  getPlaylist(id: string, fresh?: boolean): Promise<SpotifyPlaylist>;
  getPlaylistTracks(id: string, fresh?: boolean): Promise<SpotifyPlaylistItem[]>;
  getUserPlaylists(options?: { limit?: number; offset?: number }): Promise<SpotifyPaging<SpotifyPlaylist>>;
  getProfile(fresh?: boolean): Promise<SpotifyUser>;
  getHome(fresh?: boolean): Promise<SpotifyHomeData>;
  createPlaylist(input: CreatePlaylistInput): Promise<SpotifyPlaylist>;
  updatePlaylist(id: string, input: Partial<CreatePlaylistInput>): Promise<void>;
  addTracksToPlaylist(id: string, trackIds: string[]): Promise<void>;
  removeTracksFromPlaylist(id: string, trackIds: string[]): Promise<void>;
  savePlaylist(id: string): Promise<void>;
  removePlaylist(id: string): Promise<void>;
}

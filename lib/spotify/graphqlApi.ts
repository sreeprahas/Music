import { spotifyGraphQl } from './graphql-client';
import type { SpotifyAlbum, SpotifyPaging, SpotifyPlaylist, SpotifyPlaylistItem, SpotifyTrack } from './models';

export function searchTracksGraphQl(query: string, limit = 20): Promise<SpotifyPaging<SpotifyTrack>> { return spotifyGraphQl.searchTracks(query, limit); }
export function getPlaylistGraphQl(id: string, fresh = false): Promise<SpotifyPlaylist> { return spotifyGraphQl.getPlaylist(id, fresh); }
export function getPlaylistTracksGraphQl(id: string, fresh = false): Promise<SpotifyPlaylistItem[]> { return spotifyGraphQl.getPlaylistTracks(id, fresh); }
export function getTrackGraphQl(id: string, fresh = false): Promise<SpotifyTrack> { return spotifyGraphQl.getTrack(id, fresh); }
export function getAlbumGraphQl(id: string, fresh = false): Promise<{ album: SpotifyAlbum; items: SpotifyPlaylistItem[] }> { return spotifyGraphQl.getAlbum(id, fresh); }

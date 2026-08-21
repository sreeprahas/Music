import { cacheKey } from '@/lib/cache/keys';
import { getPersistent, setPersistent } from '@/lib/cache/persistent';
import { LruCache } from '@/lib/cache/lru';
import type { Playlist, Track } from '@/types';
import type { SpotifyAlbum, SpotifyArtist, SpotifyHomeData, SpotifyPaging, SpotifyPlaylist, SpotifyPlaylistItem, SpotifyTrack, SpotifyUser } from './models';
import type { SpotifyProvider } from './provider';
import { getSpotifyProvider } from './spotapi';
import { normalizePlaylist, normalizePlaylistItems, normalizeTrack } from './normalize';

const cache = new LruCache<unknown>(256);
const TTL = 15 * 60 * 1000;

/** Application service. Routes and domain code depend on this, never SpotAPI. */
export class SpotifyService {
  constructor(private readonly provider: SpotifyProvider) {}

  async searchTracks(query: string, limit = 20, offset = 0): Promise<SpotifyPaging<SpotifyTrack>> {
    const result = await this.provider.search(query, { types: ['track'], limit, offset });
    return result.tracks;
  }
  async search(query: string, limit = 20, offset = 0) { return this.provider.search(query, { limit, offset }); }
  async getTrack(id: string, fresh = false) { return this.cached(cacheKey.spotifyTrack(id), () => this.provider.getTrack(id, fresh), fresh); }
  async getArtist(id: string, fresh = false) { return this.cached(cacheKey.spotifyArtist(id), () => this.provider.getArtist(id, fresh), fresh); }
  async getAlbum(id: string, fresh = false): Promise<{ album: SpotifyAlbum; items: SpotifyPlaylistItem[] }> { return this.cached(cacheKey.spotifyAlbum(id), () => this.provider.getAlbum(id, fresh), fresh); }
  async getPlaylist(id: string, fresh = false) { return this.cached(cacheKey.spotifyPlaylist(id), () => this.provider.getPlaylist(id, fresh), fresh); }
  async getPlaylistTracks(id: string, fresh = false) { return this.cached(cacheKey.spotifyPlaylistTracks(id), () => this.provider.getPlaylistTracks(id, fresh), fresh); }
  async getUserPlaylists(options: { limit?: number; offset?: number } = {}): Promise<Playlist[]> { const page = await this.provider.getUserPlaylists(options); return page.items.map((playlist) => normalizePlaylist(playlist)); }
  async getProfile(fresh = false): Promise<SpotifyUser> { return this.cached(cacheKey.spotifyProfile(), () => this.provider.getProfile(fresh), fresh); }
  async getHome(fresh = false): Promise<SpotifyHomeData> { return this.cached(cacheKey.spotifyHome(), () => this.provider.getHome(fresh), fresh); }
  async createPlaylist(input: Parameters<SpotifyProvider['createPlaylist']>[0]) { return this.provider.createPlaylist(input); }
  async updatePlaylist(id: string, input: Parameters<SpotifyProvider['updatePlaylist']>[1]) { return this.provider.updatePlaylist(id, input); }
  async addTracksToPlaylist(id: string, trackIds: string[]) { return this.provider.addTracksToPlaylist(id, trackIds); }
  async removeTracksFromPlaylist(id: string, trackIds: string[]) { return this.provider.removeTracksFromPlaylist(id, trackIds); }
  async savePlaylist(id: string) { return this.provider.savePlaylist(id); }
  async removePlaylist(id: string) { return this.provider.removePlaylist(id); }

  normalizeTrack(track: SpotifyTrack, position = 0, playlistId?: string): Track { return normalizeTrack(track, position, playlistId); }
  normalizePlaylist(playlist: SpotifyPlaylist, sourceUrl?: string): Playlist { return normalizePlaylist(playlist, sourceUrl); }
  normalizePlaylistItems(items: SpotifyPlaylistItem[], playlistId?: string): Track[] { return normalizePlaylistItems(items, playlistId); }

  private async cached<T>(key: string, load: () => Promise<T>, fresh: boolean): Promise<T> {
    if (!fresh) { const memory = cache.get(key) as T | undefined; if (memory !== undefined) return memory; const persistent = getPersistent<T>(key); if (persistent !== undefined) { cache.set(key, persistent, TTL); return persistent; } }
    const value = await load(); cache.set(key, value, TTL); setPersistent(key, value, TTL); return value;
  }
}

export const spotify = new SpotifyService(getSpotifyProvider());

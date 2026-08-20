/**
 * Spotify GraphQL client - powered by @sreeprahas/musicgql SpotifyGraphQLProvider.
 *
 * Public interface is unchanged: SpotifyGraphQlClient + spotifyGraphQl singleton.
 * Callers (graphqlApi.ts, route handlers) require no modification.
 *
 * Authentication: the provider reads SPOTIFY_ACCESS_TOKEN from the server-side
 * environment. This variable is never committed, never exposed to the client
 * bundle, and is optional - when absent the provider returns a clean auth error.
 *
 * No forbidden transports (REST, WebQL, InnerTube, Google APIs) are used.
 */

import {
  SpotifyGraphQLProvider,
  UnsupportedCapabilityError,
  ProviderAuthenticationError,
} from '@sreeprahas/musicgql';
import type {
  SpotifyAlbum,
  SpotifyArtist,
  SpotifyPlaylist,
  SpotifyPlaylistItem,
  SpotifyPaging,
  SpotifyTrack,
} from './models';
import {
  toSpotifyTrack,
  toSpotifyAlbum,
  toSpotifyArtist,
  toSpotifyPlaylist,
} from './musicgqlAdapter';
import { SpotifyAuthenticationError, SpotifyGraphQlError } from './errors';
import { cacheKey } from '@/lib/cache/keys';
import { LruCache } from '@/lib/cache/lru';
import { getPersistent, setPersistent } from '@/lib/cache/persistent';

const entityCache = new LruCache<unknown>(256);
const ENTITY_TTL = 15 * 60 * 1000;

export interface SpotifyHomeData {
  playlists: SpotifyPaging<SpotifyPlaylist> | null;
  topTracks: SpotifyPaging<SpotifyTrack> | null;
  topArtists: SpotifyPaging<SpotifyArtist> | null;
  newReleases: unknown;
}

async function getServerAccessToken(): Promise<string> {
  // Prefer PKCE session token; fall back to env var for manual testing only.
  const { getSpotifyAccessToken } = await import('@/lib/auth/spotify-session');
  const sessionToken = await getSpotifyAccessToken();
  if (sessionToken) return sessionToken;
  return process.env.SPOTIFY_ACCESS_TOKEN ?? '';
}

function translateError(err: unknown): never {
  if (err instanceof ProviderAuthenticationError) {
    throw new SpotifyAuthenticationError(err.message);
  }
  if (err instanceof UnsupportedCapabilityError) {
    throw new SpotifyGraphQlError(err.message, 501, 'spotify_unsupported');
  }
  if (err instanceof Error) {
    const status = (err as { statusCode?: number }).statusCode ?? 0;
    throw new SpotifyGraphQlError(err.message, status);
  }
  throw new SpotifyGraphQlError('Unexpected Spotify error', 0);
}

const provider = new SpotifyGraphQLProvider({
  getAccessToken: async () => getServerAccessToken(),
});

/** GraphQL-only Spotify adapter. Powered by @sreeprahas/musicgql. */
export class SpotifyGraphQlClient {
  async searchTracks(query: string, limit = 20): Promise<SpotifyPaging<SpotifyTrack>> {
    const normalized = query.trim();
    if (!normalized) return emptyPaging<SpotifyTrack>();
    try {
      const result = await provider.search(normalized, { limit });
      const items = result.tracks.items.map(toSpotifyTrack);
      return {
        href: '',
        items,
        limit,
        offset: result.tracks.offset,
        total: result.tracks.totalCount,
        next: result.tracks.hasMore ? 'more' : null,
        previous: null,
      };
    } catch (err) {
      return translateError(err);
    }
  }

  async getTrack(id: string, fresh = false): Promise<SpotifyTrack> {
    return this.cached(cacheKey.spotifyTrack(id), async () => {
      try {
        return toSpotifyTrack(await provider.getTrack(id));
      } catch (err) {
        return translateError(err);
      }
    }, fresh);
  }

  async getAlbum(id: string, fresh = false): Promise<{ album: SpotifyAlbum; items: SpotifyPlaylistItem[] }> {
    return this.cached(cacheKey.spotifyAlbum(id), async () => {
      try {
        const album = await provider.getAlbum(id);
        return {
          album: toSpotifyAlbum(album),
          items: [],
        };
      } catch (err) {
        return translateError(err);
      }
    }, fresh);
  }

  async getArtist(id: string, fresh = false): Promise<SpotifyArtist> {
    return this.cached(cacheKey.spotifyArtist(id), async () => {
      try {
        return toSpotifyArtist(await provider.getArtist(id));
      } catch (err) {
        return translateError(err);
      }
    }, fresh);
  }

  async getPlaylist(id: string, fresh = false): Promise<SpotifyPlaylist> {
    return this.cached(cacheKey.spotifyPlaylist(id), async () => {
      try {
        return toSpotifyPlaylist(await provider.getPlaylist(id));
      } catch (err) {
        return translateError(err);
      }
    }, fresh);
  }

  async getPlaylistTracks(id: string, fresh = false): Promise<SpotifyPlaylistItem[]> {
    return this.cached(cacheKey.spotifyPlaylistTracks(id), async () => {
      // fetchPlaylist returns playlist metadata only; track listing pagination
      // is an unverified operation. Return empty until a verified operation exists.
      return [];
    }, fresh);
  }

  async getProfile(fresh = false): Promise<Record<string, unknown>> {
    return this.cached(cacheKey.spotifyProfile(), async () => {
      // Profile operation is unverified in musicgql registry.
      return {};
    }, fresh);
  }

  async getHome(fresh = false): Promise<SpotifyHomeData> {
    return this.cached(cacheKey.spotifyHome(), async () => {
      // Home operation is unverified in musicgql registry.
      return { playlists: null, topTracks: null, topArtists: null, newReleases: null };
    }, fresh);
  }

  private async cached<T>(key: string, load: () => Promise<T>, fresh: boolean): Promise<T> {
    if (!fresh) {
      const memory = entityCache.get(key) as T | undefined;
      if (memory !== undefined) return memory;
      const persistent = getPersistent<T>(key);
      if (persistent !== undefined) {
        entityCache.set(key, persistent, ENTITY_TTL);
        return persistent;
      }
    }
    const value = await load();
    entityCache.set(key, value, ENTITY_TTL);
    setPersistent(key, value, ENTITY_TTL);
    return value;
  }
}

function emptyPaging<T>(): SpotifyPaging<T> {
  return { href: '', items: [], limit: 0, offset: 0, total: 0, next: null, previous: null };
}

export const spotifyGraphQl = new SpotifyGraphQlClient();

import { requestSpotifyWorker } from '@/electron/spotify/worker-client';
import { assertSupportedProvider } from './config';
import { SpotifyAuthenticationError, SpotifyProviderError, SpotifyUnavailableError } from './errors';
import type { CreatePlaylistInput, SpotifyAlbum, SpotifyArtist, SpotifyHomeData, SpotifyImage, SpotifyPaging, SpotifyPlaylist, SpotifyPlaylistItem, SpotifySearchResult, SpotifyTrack, SpotifyUser } from './models';
import type { SpotifyProvider, SpotifySearchOptions } from './provider';

type JsonObject = Record<string, unknown>;
const asObject = (value: unknown): JsonObject => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const first = (...values: unknown[]) => values.find((value) => value !== undefined && value !== null);
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback;
const number = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : Number.isFinite(Number(value)) ? Number(value) : fallback;
const bool = (value: unknown, fallback = false) => typeof value === 'boolean' ? value : fallback;

function uriFor(type: string, id: string): string { return id ? `spotify:${type}:${id}` : ''; }
function idFrom(value: unknown, type = ''): string { const raw = text(value); if (raw.includes(':')) return raw.split(':').pop() || ''; if (raw.includes('/')) return raw.split('/').pop() || ''; return raw || type; }
function entity(value: unknown): JsonObject { const root = asObject(value); const item = asObject(root.item); if (Object.keys(item).length) return asObject(first(item.data, item)); return asObject(first(root.data, root.track, root.artist, root.playlist, root.profile, root)); }
function images(value: unknown): SpotifyImage[] { return asArray(value).map((source) => { const item = asObject(source); return { url: text(first(item.url, item.uri)), height: number(item.height, 0) || null, width: number(item.width, 0) || null }; }).filter((item) => item.url); }
function artwork(raw: JsonObject): SpotifyImage[] { const cover = asObject(first(raw.coverArt, raw.visuals)); return images(first(raw.images, raw.image, cover.sources, raw.sources)); }

function toArtist(value: unknown): SpotifyArtist {
  const raw = entity(value); const id = idFrom(first(raw.id, raw.uri, raw.url));
  return { id, name: text(first(raw.name, asObject(raw.profile).name), 'Unknown artist'), uri: text(raw.uri, uriFor('artist', id)), images: artwork(raw), genres: asArray(raw.genres).map((item) => text(item)).filter(Boolean), popularity: typeof raw.popularity === 'number' ? raw.popularity : undefined };
}

function toAlbum(value: unknown): SpotifyAlbum {
  const raw = entity(value); const id = idFrom(first(raw.id, raw.uri, raw.url));
  const artistValues = first(raw.artists, raw.artist, asObject(raw.artists).items);
  return { id, name: text(raw.name, 'Unknown album'), uri: text(raw.uri, uriFor('album', id)), album_type: text(first(raw.album_type, raw.type)) || undefined, release_date: text(first(raw.release_date, raw.releaseDate)) || undefined, total_tracks: number(first(raw.total_tracks, raw.totalTracks), 0) || undefined, images: artwork(raw), artists: asArray(artistValues).map(toArtist) };
}

function toTrack(value: unknown): SpotifyTrack {
  const raw = entity(value); const id = idFrom(first(raw.id, raw.uri, raw.url));
  const artistValues = first(raw.artists, raw.artist, asObject(raw.artists).items);
  const albumValue = first(raw.album, raw.albumOfTrack);
  const duration = asObject(raw.duration);
  return { id, name: text(first(raw.name, raw.title), 'Unknown track'), uri: text(raw.uri, uriFor('track', id)), duration_ms: number(first(raw.duration_ms, raw.durationMs, raw.duration_ms_string, duration.totalMilliseconds, duration.ms), 0), explicit: typeof raw.explicit === 'boolean' ? raw.explicit : undefined, artists: asArray(artistValues).map(toArtist), album: albumValue ? toAlbum(albumValue) : undefined, preview_url: text(first(raw.preview_url, raw.previewUrl)) || null, external_ids: { isrc: text(asObject(raw.external_ids).isrc) || undefined }, popularity: typeof raw.popularity === 'number' ? raw.popularity : undefined };
}

function toPlaylist(value: unknown): SpotifyPlaylist {
  const raw = entity(value); const id = idFrom(first(raw.id, raw.uri, raw.url)); const owner = entity(first(raw.owner, raw.creator));
  const tracks = asObject(first(raw.tracks, raw.contents)); const total = number(first(tracks.total, tracks.totalCount, asObject(tracks.items).total), 0);
  return { id, name: text(first(raw.name, raw.title), 'Untitled playlist'), description: text(first(raw.description, raw.subtitle)) || undefined, uri: text(raw.uri, uriFor('playlist', id)), images: artwork(raw), snapshot_id: text(first(raw.snapshot_id, raw.snapshotId, raw.revision)) || undefined, collaborative: typeof raw.collaborative === 'boolean' ? raw.collaborative : undefined, public: typeof raw.public === 'boolean' ? raw.public : undefined, owner: Object.keys(owner).length ? { id: idFrom(first(owner.id, owner.uri)), display_name: text(first(owner.display_name, owner.name)) || null, uri: text(owner.uri, uriFor('user', idFrom(first(owner.id, owner.uri)))) } : undefined, tracks: { href: '', total, next: null } };
}

function toItem(value: unknown): SpotifyPlaylistItem { const raw = asObject(value); const track = first(raw.track, raw.item, raw); return { added_at: text(first(raw.added_at, raw.addedAt)) || undefined, is_local: bool(first(raw.is_local, raw.isLocal), false), track: track ? toTrack(track) : null }; }

function nodeAt(root: unknown, paths: string[][]): unknown { for (const path of paths) { let current: unknown = root; for (const key of path) current = asObject(current)[key]; if (current !== undefined && current !== null) return current; } return undefined; }
function paging<T>(value: unknown, map: (item: unknown) => T, limit: number, offset: number): SpotifyPaging<T> { const root = asObject(value); const data = asObject(root.data); const me = asObject(data.me); const raw = asObject(first(root.playlists, root.tracks, root.artists, root.albums, me.libraryV3, data.libraryV3, root.data, value)); const items = asArray(first(raw.items, raw.results, raw.data)); const pagingInfo = asObject(raw.pagingInfo); return { href: text(raw.href), items: items.map(map), limit: number(first(raw.limit, pagingInfo.limit), limit), offset: number(first(raw.offset, pagingInfo.offset), offset), total: number(first(raw.total, raw.totalCount), items.length), next: text(raw.next) || null, previous: text(raw.previous) || null }; }
function emptyPaging<T>(limit = 20, offset = 0): SpotifyPaging<T> { return { href: '', items: [], limit, offset, total: 0, next: null, previous: null }; }

export class SpotApiProvider implements SpotifyProvider {
  readonly name = 'spotapi';
  constructor() {}

  async search(query: string, options: SpotifySearchOptions = {}): Promise<SpotifySearchResult> {
    const limit = Math.min(50, Math.max(1, options.limit || 20)); const offset = Math.max(0, options.offset || 0); const types = options.types?.join(',') || 'track,artist,album,playlist';
    const payload = await this.request<unknown>('search', { query, types, limit, offset });
    const tracks = nodeAt(payload, [['tracks'], ['data', 'tracks'], ['search', 'tracks'], ['data', 'searchV2', 'tracksV2']]);
    const artists = nodeAt(payload, [['artists'], ['data', 'artists'], ['search', 'artists'], ['data', 'searchV2', 'artists']]);
    const albums = nodeAt(payload, [['albums'], ['data', 'albums'], ['search', 'albums'], ['data', 'searchV2', 'albumsV2']]);
    const playlists = nodeAt(payload, [['playlists'], ['data', 'playlists'], ['search', 'playlists'], ['data', 'searchV2', 'playlistsV2']]);
    return { tracks: paging(tracks, toTrack, limit, offset), artists: paging(artists, toArtist, limit, offset), albums: paging(albums, toAlbum, limit, offset), playlists: paging(playlists, toPlaylist, limit, offset) };
  }

  async getTrack(id: string): Promise<SpotifyTrack> { return toTrack(await this.request('get_track', { id })); }
  async getArtist(id: string): Promise<SpotifyArtist> { return toArtist(await this.request('get_artist', { id })); }
  async getAlbum(id: string): Promise<{ album: SpotifyAlbum; items: SpotifyPlaylistItem[] }> { const payload = await this.request<unknown>('get_album', { id }); const root = asObject(payload); const album = toAlbum(first(root.album, payload)); return { album, items: asArray(first(root.items, asObject(root.tracks).items)).map(toItem) }; }
  async getPlaylist(id: string): Promise<SpotifyPlaylist> { return toPlaylist(await this.request('get_playlist', { id })); }
  async getPlaylistTracks(id: string): Promise<SpotifyPlaylistItem[]> { const payload = await this.request<unknown>('get_playlist_tracks', { id }); return asArray(payload).map(toItem); }
  async getUserPlaylists(options: { limit?: number; offset?: number } = {}): Promise<SpotifyPaging<SpotifyPlaylist>> { const limit = Math.min(50, Math.max(1, options.limit || 50)); const offset = Math.max(0, options.offset || 0); return paging(await this.request('get_user_playlists', { limit, offset }), toPlaylist, limit, offset); }
  async getProfile(): Promise<SpotifyUser> { const raw = entity(await this.request('get_profile')); const id = idFrom(first(raw.id, raw.uri)); return { id, display_name: text(first(raw.display_name, raw.name)) || null, email: text(raw.email) || undefined, product: text(raw.product) || undefined, images: artwork(raw), uri: text(raw.uri, uriFor('user', id)) }; }
  async getHome(): Promise<SpotifyHomeData> { const root = asObject(await this.request('get_home')); return { playlists: root.playlists ? paging(root.playlists, toPlaylist, 20, 0) : null, topTracks: root.topTracks ? paging(root.topTracks, toTrack, 20, 0) : null, topArtists: root.topArtists ? paging(root.topArtists, toArtist, 20, 0) : null, newReleases: root.newReleases ?? null }; }
  async createPlaylist(input: CreatePlaylistInput): Promise<SpotifyPlaylist> { return toPlaylist(await this.request('create_playlist', { input })); }
  async updatePlaylist(id: string, input: Partial<CreatePlaylistInput>): Promise<void> { await this.request('update_playlist', { id, input }); }
  async addTracksToPlaylist(id: string, trackIds: string[]): Promise<void> { await this.request('add_tracks', { id, trackIds }); }
  async removeTracksFromPlaylist(id: string, trackIds: string[]): Promise<void> { await this.request('remove_tracks', { id, trackIds }); }
  async savePlaylist(id: string): Promise<void> { await this.request('save_playlist', { id }); }
  async removePlaylist(id: string): Promise<void> { await this.request('remove_playlist', { id }); }

  private async request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    try { return await requestSpotifyWorker<T>(method, params); }
    catch (error) {
      const code = error instanceof Error ? error.name : 'SPOTIFY_ERROR';
      const message = error instanceof Error ? error.message : 'Spotify worker request failed.';
      if (code === 'AUTH_REQUIRED') throw new SpotifyAuthenticationError(message);
      if (['WORKER_STOPPED', 'WORKER_BUSY', 'WORKER_TIMEOUT', 'WORKER_CRASHED', 'WORKER_UNAVAILABLE'].includes(code)) throw new SpotifyUnavailableError(message);
      throw new SpotifyProviderError(message, code === 'UNSUPPORTED' ? 501 : 502, code.toLowerCase());
    }
  }
}

const provider = new SpotApiProvider();
export function getSpotifyProvider(): SpotifyProvider { assertSupportedProvider(); return provider; }

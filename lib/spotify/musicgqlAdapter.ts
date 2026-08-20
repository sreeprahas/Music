/**
 * Adapter layer: musicgql unified models -> Music1 Spotify model shapes.
 *
 * Music1's normalize.ts depends on SpotifyTrack/SpotifyAlbum/SpotifyPlaylist
 * (lib/spotify/models.ts). This adapter converts musicgql's UnifiedTrack etc.
 * into those shapes so all downstream normalize.ts / graphqlApi callers remain
 * unchanged.
 *
 * No raw GraphQL response structures are exposed beyond this file.
 */

import type {
  UnifiedTrack,
  UnifiedAlbum,
  UnifiedArtist,
  UnifiedPlaylist,
} from '@sreeprahas/musicgql';
import type {
  SpotifyTrack,
  SpotifyAlbum,
  SpotifyArtist,
  SpotifyPlaylist,
  SpotifyImage,
} from './models';

function toImage(img: { url: string; width?: number; height?: number }): SpotifyImage {
  return { url: img.url, width: img.width ?? null, height: img.height ?? null };
}

export function toSpotifyArtist(a: UnifiedArtist): SpotifyArtist {
  return {
    id: a.id,
    name: a.name,
    uri: a.uri,
    images: a.images.map(toImage),
    genres: a.genres,
    popularity: undefined,
  };
}

export function toSpotifyTrack(t: UnifiedTrack): SpotifyTrack {
  return {
    id: t.id,
    name: t.name,
    uri: t.uri,
    duration_ms: t.durationMs,
    explicit: t.explicit,
    artists: t.artists.map(toSpotifyArtist),
    album: t.album ? toSpotifyAlbum(t.album) : undefined,
    preview_url: null,
    popularity: undefined,
  };
}

export function toSpotifyAlbum(a: UnifiedAlbum): SpotifyAlbum {
  return {
    id: a.id,
    name: a.name,
    uri: a.uri,
    album_type: undefined,
    release_date: a.releaseDate,
    images: a.images.map(toImage),
    artists: a.artists.map(toSpotifyArtist),
  };
}

export function toSpotifyPlaylist(p: UnifiedPlaylist): SpotifyPlaylist {
  return {
    id: p.id,
    name: p.name,
    uri: p.uri,
    description: p.description,
    owner: p.ownerName ? { id: '', display_name: p.ownerName, uri: '' } : undefined,
    images: p.images.map(toImage),
    tracks: { href: '', total: p.totalTracks },
    snapshot_id: undefined,
    collaborative: false,
    public: null,
  };
}
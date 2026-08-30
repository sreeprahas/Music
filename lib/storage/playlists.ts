/**
 * lib/storage/playlists.ts
 *
 * Playlist repository.
 * Handles CRUD, artwork aggregation, import reconciliation.
 */

import { getDb } from './db';
import { getPlaylistTracks, setPlaylistTracks } from './tracks';
import { deleteSavedLyrics } from './lyrics';
import {
  reconcilePlaylistThumbnails,
  deletePlaylistThumbnailDir,
  trackThumbnailApiUrl,
  playlistCompositeApiUrl,
  downloadTrackThumbnail,
} from './thumbnails';
import type { Playlist, Track } from '@/types';
import fs from 'fs';

// ─── Row type ─────────────────────────────────────────────────────────────────

interface PlaylistRow {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  track_count: number;
  source: string | null;
  source_url: string | null;
  source_playlist_id: string | null;
  source_revision: string | null;
  sync_status: string;
  sync_error: string | null;
  last_synced_at: string | null;
  imported_at: string | null;
  sync_on_open?: number;
  created_at: string;
}

// ─── Row ↔ Playlist ───────────────────────────────────────────────────────────

function rowToPlaylist(row: PlaylistRow): Playlist {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    thumbnailUrl: row.thumbnail_url,
    trackCount: row.track_count,
    source: (row.source as Playlist['source']) ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    sourcePlaylistId: row.source_playlist_id ?? undefined,
    sourceRevision: row.source_revision ?? undefined,
    syncStatus: (row.sync_status as Playlist['syncStatus']) ?? 'idle',
    syncError: row.sync_error ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
    importedAt: row.imported_at ?? undefined,
    syncOnOpen: Boolean(row.sync_on_open),
    createdAt: row.created_at,
  };
}

function playlistToRow(p: Playlist): Omit<PlaylistRow, 'track_count'> {
  return {
    id: p.id,
    title: p.title,
    description: p.description || '',
    thumbnail_url: p.thumbnailUrl || '',
    source: p.source ?? null,
    source_url: p.sourceUrl ?? null,
    source_playlist_id: p.sourcePlaylistId ?? null,
    source_revision: p.sourceRevision ?? null,
    sync_status: p.syncStatus || 'idle',
    sync_error: p.syncError ?? null,
    last_synced_at: p.lastSyncedAt ?? null,
    imported_at: p.importedAt ?? null,
    sync_on_open: p.syncOnOpen ? 1 : 0,
    created_at: p.createdAt || new Date().toISOString(),
  };
}

// ─── Unique Title Allocation ─────────────────────────────────────────────────

/**
 * Atomically checks for duplicate playlist names in SQLite and generates
 * unique incrementing title: "Title", "Title - 1", "Title - 2", etc.
 */
export function allocateUniquePlaylistTitle(
  requestedTitle: string,
  excludePlaylistId?: string,
): string {
  const db = getDb();
  const baseTitle = (requestedTitle || 'Untitled Playlist').trim() || 'Untitled Playlist';
  let candidate = baseTitle;
  let counter = 1;

  while (true) {
    const existing = excludePlaylistId
      ? db.prepare('SELECT id FROM playlists WHERE title = ? AND id != ?').get(candidate, excludePlaylistId)
      : db.prepare('SELECT id FROM playlists WHERE title = ?').get(candidate);

    if (!existing) return candidate;
    candidate = `${baseTitle} - ${counter++}`;
  }
}

export function setPlaylistSyncOnOpen(playlistId: string, syncOnOpen: boolean): void {
  const db = getDb();
  db.prepare('UPDATE playlists SET sync_on_open = ? WHERE id = ?').run(syncOnOpen ? 1 : 0, playlistId);
}

// ─── Artwork aggregation ──────────────────────────────────────────────────────

function withPlaylistArtwork(playlist: Playlist, tracks: Track[]): Playlist {
  // Playlist cards use a single 2x2 composite cover image (1280x1280 lossless WebP)
  // generated from the first four cached track thumbnails. Always route through the
  // local composite endpoint — the raw track thumbnailUrl is the YouTube CDN
  // (hqdefault.jpg, 120x90) and looks blurry when upscaled; the composite is
  // crisp at any card size.
  const artTracks = tracks.slice(0, 4).filter((t) => t.videoId || t.sourceTrackId || t.thumbnailUrl);
  if (artTracks.length >= 4) {
    // All four tiles available — serve the composite cover.
    const thumbnailUrls = [playlistCompositeApiUrl(playlist.id)];
    const thumbnailVideoIds = artTracks.map((t) => t.videoId || t.sourceTrackId || '');

    return {
      ...playlist,
      thumbnailUrls,
      thumbnailVideoIds,
    };
  }

  // Fewer than 4 tiles — fall back to individual thumbnails so the card still
  // shows something meaningful.
  if (artTracks.length > 0) {
    const thumbnailUrls = artTracks.map((t) => {
      const key = t.sourceTrackId || t.videoId;
      return key ? trackThumbnailApiUrl(playlist.id, key, t.title) : '';
    }).filter(Boolean);
    const thumbnailVideoIds = artTracks.map((t) => t.videoId || t.sourceTrackId || '');

    return {
      ...playlist,
      thumbnailUrls,
      thumbnailVideoIds,
    };
  }

  return { ...playlist, thumbnailUrls: [], thumbnailVideoIds: [] };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getLocalPlaylists(): Playlist[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM playlists ORDER BY rowid ASC').all() as unknown as PlaylistRow[];
  return rows.map((row) => {
    const playlist = rowToPlaylist(row);
    const tracks = getPlaylistTracks(row.id);
    return withPlaylistArtwork(playlist, tracks);
  });
}

export function getPlaylistById(id: string): Playlist | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM playlists WHERE id = ?').get(id) as PlaylistRow | undefined;
  if (!row) return undefined;
  const playlist = rowToPlaylist(row);
  const tracks = getPlaylistTracks(id);
  return withPlaylistArtwork(playlist, tracks);
}

export function findPlaylistBySourceUrl(sourceUrl: string): Playlist | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM playlists WHERE source_url = ?').get(sourceUrl) as PlaylistRow | undefined;
  return row ? rowToPlaylist(row) : undefined;
}

export function upsertPlaylist(playlist: Playlist, tracks?: Track[]): Playlist {
  const db = getDb();
  const uniqueTitle = allocateUniquePlaylistTitle(playlist.title, playlist.id);
  const playlistToSave: Playlist = { ...playlist, title: uniqueTitle };
  const row = playlistToRow(playlistToSave);
  const trackCount = tracks?.length ?? playlist.trackCount ?? 0;

  db.prepare(`
    INSERT INTO playlists
      (id, title, description, thumbnail_url, track_count, source, source_url, source_playlist_id,
       source_revision, sync_status, sync_error, last_synced_at, imported_at, sync_on_open, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title              = excluded.title,
      description        = excluded.description,
      thumbnail_url      = excluded.thumbnail_url,
      track_count        = excluded.track_count,
      source             = excluded.source,
      source_url         = excluded.source_url,
      source_playlist_id = excluded.source_playlist_id,
      source_revision    = excluded.source_revision,
      sync_status        = excluded.sync_status,
      sync_error         = excluded.sync_error,
      last_synced_at     = excluded.last_synced_at,
      imported_at        = excluded.imported_at,
      sync_on_open       = excluded.sync_on_open
  `).run(
    row.id, row.title, row.description, row.thumbnail_url, trackCount,
    row.source, row.source_url, row.source_playlist_id, row.source_revision,
    row.sync_status, row.sync_error, row.last_synced_at, row.imported_at, row.sync_on_open ?? 0, row.created_at,
  );

  if (tracks !== undefined) {
    setPlaylistTracks(playlist.id, tracks);
    // Update track count to actual stored count
    db.prepare('UPDATE playlists SET track_count = ? WHERE id = ?').run(tracks.length, playlist.id);
  }

  const stored = getPlaylistById(playlist.id)!;
  return withPlaylistArtwork(stored, tracks ?? getPlaylistTracks(playlist.id));
}

export function deletePlaylist(playlistId: string): void {
  const db = getDb();
  const tracksBeingRemoved = getPlaylistTracks(playlistId);

  db.exec('BEGIN');
  try {
    // playlist_tracks rows cascade via FK ON DELETE CASCADE.
    db.prepare('DELETE FROM playlists WHERE id = ?').run(playlistId);

    // Track rows are shared between playlists. Remove only rows that became
    // orphaned, and clean mappings for Spotify tracks no longer in the library.
    db.exec('DELETE FROM tracks WHERE id NOT IN (SELECT track_id FROM playlist_tracks)');
    db.exec(`
      DELETE FROM spotify_youtube_map
      WHERE spotify_track_id NOT IN (
        SELECT source_track_id FROM tracks WHERE source_track_id <> ''
      )
    `);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  // Remove all playlist-scoped artwork. Lyrics are shared by title/artist, so
  // delete a lyric file only when no remaining track can use it.
  deletePlaylistThumbnailDir(playlistId);
  for (const track of tracksBeingRemoved) {
    const stillUsed = db.prepare(`
      SELECT 1
      FROM playlist_tracks pt
      JOIN tracks t ON t.id = pt.track_id
      WHERE t.title = ? AND t.artist = ?
      LIMIT 1
    `).get(track.title, track.artist);
    if (!stillUsed) deleteSavedLyrics(track.artist, track.title);
  }
}

/**
 * Full import/re-import reconciliation.
 * 1. Allocates unique title to prevent collisions
 * 2. Prepares local track thumbnail URLs
 * 3. Runs single SQLite transaction: upserts playlist & replaces track memberships
 * 4. Downloads/reconciles scraper-provided artwork in background asynchronously
 * Returns stored Playlist + Track[] immediately.
 */
export async function reconcilePlaylist(
  playlist: Playlist,
  rawTracks: Track[],
  coverUrl?: string,
  asyncArtwork = true,
): Promise<{ playlist: Playlist; tracks: Track[] }> {
  const db = getDb();
  const uniqueTitle = allocateUniquePlaylistTitle(playlist.title, playlist.id);
  const playlistToSave: Playlist = { ...playlist, title: uniqueTitle };
  const row = playlistToRow(playlistToSave);

  // Assign local thumbnail URLs immediately
  const tracksWithApiUrls = rawTracks.map((t, idx) => {
    const key = t.sourceTrackId || t.videoId;
    return {
      ...t,
      playlistId: playlist.id,
      position: idx,
      thumbnailUrl: key ? trackThumbnailApiUrl(playlist.id, key, t.title) : (t.thumbnailUrl || ''),
    };
  });

  db.exec('BEGIN');
  try {
    // 1. Upsert playlist
    db.prepare(`
      INSERT INTO playlists
        (id, title, description, thumbnail_url, track_count, source, source_url, source_playlist_id,
         source_revision, sync_status, sync_error, last_synced_at, imported_at, sync_on_open, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title              = excluded.title,
        description        = excluded.description,
        thumbnail_url      = excluded.thumbnail_url,
        track_count        = excluded.track_count,
        source             = excluded.source,
        source_url         = excluded.source_url,
        source_playlist_id = excluded.source_playlist_id,
        source_revision    = excluded.source_revision,
        sync_status        = excluded.sync_status,
        sync_error         = excluded.sync_error,
        last_synced_at     = excluded.last_synced_at,
        imported_at        = excluded.imported_at,
        sync_on_open       = excluded.sync_on_open
    `).run(
      row.id, row.title, row.description, row.thumbnail_url, tracksWithApiUrls.length,
      row.source, row.source_url, row.source_playlist_id, row.source_revision,
      row.sync_status, row.sync_error, row.last_synced_at, row.imported_at, row.sync_on_open ?? 0, row.created_at,
    );

    // 2. Replace track membership with local thumbnail URLs
    setPlaylistTracks(playlist.id, tracksWithApiUrls, false);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  // 3. Artwork reconciliation (background async or awaited)
  const artworkPromise = (async () => {
    try {
      await reconcilePlaylistThumbnails(playlist.id, rawTracks, coverUrl);
    } catch (err) {
      console.warn(`[storage] Background artwork download warning for ${playlist.id}:`, err);
    }
  })();

  if (!asyncArtwork) {
    await artworkPromise;
  }

  const storedPlaylist = getPlaylistById(playlist.id)!;
  const finalTracks = getPlaylistTracks(playlist.id);
  return { playlist: withPlaylistArtwork(storedPlaylist, finalTracks), tracks: finalTracks };
}

export function getPlaylistWithArtwork(playlistId: string): Playlist | undefined {
  const playlist = getPlaylistById(playlistId);
  if (!playlist) return undefined;
  const tracks = getPlaylistTracks(playlistId);
  return withPlaylistArtwork(playlist, tracks);
}

/**
 * Regenerate a playlist's cover artwork from its current tracks.
 *
 * Called on every app open: re-downloads the artwork for the tracks that
 * form the 4-tile mosaic (fresh renditions for Spotify tracks) and returns
 * the playlist with a freshly derived thumbnailUrls/thumbnailVideoIds set.
 */
export async function refreshPlaylistCoverArt(
  playlistId: string,
  tracks?: Track[],
): Promise<Playlist | undefined> {
  const currentTracks = tracks ?? getPlaylistTracks(playlistId);
  const artTracks = currentTracks.slice(0, 4);

  await Promise.all(artTracks.map(async (track) => {
    const key = track.sourceTrackId || track.videoId;
    if (!key) return;
    try {
      await downloadTrackThumbnail(playlistId, key, track.thumbnailUrl);
    } catch {
      // A single failed tile must not abort the whole refresh.
    }
  }));

  return getPlaylistWithArtwork(playlistId);
}

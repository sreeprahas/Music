/**
 * lib/storage/tracks.ts
 *
 * Track repository — CRUD, playlist membership, reorder.
 * All functions are synchronous (DatabaseSync).
 */

import { getDb } from './db';
import { cleanArtistName } from '@/lib/ytmusicFormat';
import type { Track } from '@/types';

// ─── Row types ────────────────────────────────────────────────────────────────

interface TrackRow {
  id: number;
  video_id: string;
  source_track_id: string;
  title: string;
  artist: string;
  album: string | null;
  duration: number | null;
  source: string | null;
  date_added: string | null;
}

interface MemberRow {
  playlist_id: string;
  track_id: number;
  position: number;
  playlist_item_id: string | null;
  thumbnail_url: string | null;
}

// ─── Row → Track ──────────────────────────────────────────────────────────────

function rowToTrack(row: TrackRow, member: MemberRow): Track {
  return {
    videoId: row.video_id,
    title: row.title,
    artist: row.artist,
    album: row.album ?? undefined,
    thumbnailUrl: member.thumbnail_url || '',
    duration: row.duration ?? undefined,
    position: member.position,
    dateAdded: row.date_added ?? undefined,
    playlistItemId: member.playlist_item_id ?? undefined,
    playlistId: member.playlist_id,
    sourceTrackId: row.source_track_id || undefined,
    source: (row.source as Track['source']) ?? undefined,
  };
}

// ─── Upsert a single track (by identity) ─────────────────────────────────────

function upsertTrackRow(track: Track): number {
  const db = getDb();
  const artist = cleanArtistName(track.artist);
  const videoId = track.videoId || '';
  const sourceTrackId = track.sourceTrackId || '';

  // Try to find existing by identity
  const existing = db
    .prepare('SELECT id FROM tracks WHERE video_id = ? AND source_track_id = ?')
    .get(videoId, sourceTrackId) as { id: number } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE tracks
      SET title = ?, artist = ?, album = ?, duration = ?, source = ?, date_added = ?
      WHERE id = ?
    `).run(track.title, artist, track.album ?? null, track.duration ?? null, track.source ?? null, track.dateAdded ?? null, existing.id);
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO tracks (video_id, source_track_id, title, artist, album, duration, source, date_added)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(videoId, sourceTrackId, track.title, artist, track.album ?? null, track.duration ?? null, track.source ?? null, track.dateAdded ?? null);

  return Number(result.lastInsertRowid);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function setPlaylistTracks(playlistId: string, tracks: Track[], manageTransaction = true): Track[] {
  const db = getDb();

  if (manageTransaction) db.exec('BEGIN');
  try {
    // Remove all existing membership rows for this playlist
    db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(playlistId);

    const inserted: Track[] = [];
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const trackId = upsertTrackRow(track);
      db.prepare(`
        INSERT INTO playlist_tracks (playlist_id, track_id, position, playlist_item_id, thumbnail_url)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (playlist_id, track_id) DO UPDATE SET
          position         = excluded.position,
          playlist_item_id = excluded.playlist_item_id,
          thumbnail_url    = excluded.thumbnail_url
      `).run(playlistId, trackId, i, track.playlistItemId ?? null, track.thumbnailUrl || null);
      inserted.push({ ...track, position: i, playlistId });
    }

    if (manageTransaction) db.exec('COMMIT');
    return inserted;
  } catch (err) {
    if (manageTransaction) db.exec('ROLLBACK');
    throw err;
  }
}

/** Get all tracks for a playlist in position order. */
export function getPlaylistTracks(playlistId: string): Track[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      t.id, t.video_id, t.source_track_id, t.title, t.artist, t.album,
      t.duration, t.source, t.date_added,
      pt.playlist_id, pt.position, pt.playlist_item_id, pt.thumbnail_url
    FROM playlist_tracks pt
    JOIN tracks t ON t.id = pt.track_id
    WHERE pt.playlist_id = ?
    ORDER BY pt.position ASC
  `).all(playlistId) as unknown as Array<TrackRow & MemberRow>;

  return rows.map((row) =>
    rowToTrack(
      row,
      {
        playlist_id: row.playlist_id,
        track_id: row.id,
        position: row.position,
        playlist_item_id: row.playlist_item_id,
        thumbnail_url: row.thumbnail_url,
      },
    ),
  );
}

/** Add a single track to a playlist (no-op if already present). */
export function addTrackToPlaylist(playlistId: string, track: Track): void {
  const db = getDb();
  const trackId = upsertTrackRow(track);
  // Find next position
  const maxPos = (db.prepare('SELECT MAX(position) as m FROM playlist_tracks WHERE playlist_id = ?').get(playlistId) as { m: number | null }).m ?? -1;
  db.prepare(`
    INSERT INTO playlist_tracks (playlist_id, track_id, position, playlist_item_id, thumbnail_url)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT DO NOTHING
  `).run(playlistId, trackId, maxPos + 1, track.playlistItemId ?? null, track.thumbnailUrl || null);
  // Update playlist track count
  db.prepare("UPDATE playlists SET track_count = (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?) WHERE id = ?").run(playlistId, playlistId);
}

/** Remove a single track from a playlist by videoId. */
export function removeTrackFromPlaylist(playlistId: string, videoId = '', sourceTrackId = ''): void {
  const db = getDb();
  const trackRow = (sourceTrackId
    ? db.prepare('SELECT id FROM tracks WHERE source_track_id = ? LIMIT 1').get(sourceTrackId)
    : db.prepare('SELECT id FROM tracks WHERE video_id = ? LIMIT 1').get(videoId)) as { id: number } | undefined;
  if (!trackRow) return;
  db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?').run(playlistId, trackRow.id);
  // Re-sequence positions
  const remaining = db.prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC').all(playlistId) as { track_id: number }[];
  for (let i = 0; i < remaining.length; i++) {
    db.prepare('UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?').run(i, playlistId, remaining[i].track_id);
  }
  db.prepare("UPDATE playlists SET track_count = ? WHERE id = ?").run(remaining.length, playlistId);
}

/** Reorder tracks in a playlist by videoId order. */
export function reorderPlaylistTracks(playlistId: string, videoIds: string[]): Track[] {
  const db = getDb();
  const all = getPlaylistTracks(playlistId);
  const byVideoId = new Map(all.map((t) => [t.videoId, t]));

  const reordered = [
    ...videoIds.map((id) => byVideoId.get(id)).filter((t): t is Track => Boolean(t)),
    ...all.filter((t) => !videoIds.includes(t.videoId)),
  ];

  db.exec('BEGIN');
  try {
    for (let i = 0; i < reordered.length; i++) {
      const t = reordered[i];
      const trackRow = db.prepare('SELECT id FROM tracks WHERE video_id = ? AND source_track_id = ?').get(t.videoId || '', t.sourceTrackId || '') as { id: number } | undefined;
      if (trackRow) {
        db.prepare('UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?').run(i, playlistId, trackRow.id);
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return reordered.map((t, i) => ({ ...t, position: i }));
}

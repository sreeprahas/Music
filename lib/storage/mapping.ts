/**
 * lib/storage/mapping.ts
 *
 * Spotify → YouTube mapping repository backed by SQLite (spotify_youtube_map table).
 * Replaces the old spotifyYoutubeMap in metadata_cache.json and entity-cache.json.
 */

import { getDb } from './db';

export interface YoutubeMapping {
  spotifyTrackId: string;
  youtubeVideoId: string;
  matchedTitle?: string;
  matchedArtist?: string;
  duration?: number;
  resolvedAt: number;
  matchMethod?: 'manual_override' | 'metadata' | 'artwork_fallback';
}

const MAX_MAPPINGS = 2048;

export function getYoutubeMapping(spotifyTrackId: string): YoutubeMapping | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM spotify_youtube_map WHERE spotify_track_id = ?').get(spotifyTrackId) as {
    spotify_track_id: string;
    youtube_video_id: string;
    matched_title: string | null;
    matched_artist: string | null;
    duration: number | null;
    resolved_at: number;
    match_method: string | null;
  } | undefined;
  if (!row) return undefined;
  return {
    spotifyTrackId: row.spotify_track_id,
    youtubeVideoId: row.youtube_video_id,
    matchedTitle: row.matched_title ?? undefined,
    matchedArtist: row.matched_artist ?? undefined,
    duration: row.duration ?? undefined,
    resolvedAt: row.resolved_at,
    matchMethod: (row.match_method as YoutubeMapping['matchMethod']) ?? undefined,
  };
}

export function setYoutubeMapping(mapping: YoutubeMapping): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO spotify_youtube_map
      (spotify_track_id, youtube_video_id, matched_title, matched_artist, duration, resolved_at, match_method)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(spotify_track_id) DO UPDATE SET
      youtube_video_id = excluded.youtube_video_id,
      matched_title    = excluded.matched_title,
      matched_artist   = excluded.matched_artist,
      duration         = excluded.duration,
      resolved_at      = excluded.resolved_at,
      match_method     = excluded.match_method
  `).run(
    mapping.spotifyTrackId,
    mapping.youtubeVideoId,
    mapping.matchedTitle ?? null,
    mapping.matchedArtist ?? null,
    mapping.duration ?? null,
    mapping.resolvedAt,
    mapping.matchMethod ?? null,
  );

  // Evict oldest entries if over limit
  const count = (db.prepare('SELECT COUNT(*) as c FROM spotify_youtube_map').get() as { c: number }).c;
  if (count > MAX_MAPPINGS) {
    db.prepare(`
      DELETE FROM spotify_youtube_map
      WHERE spotify_track_id IN (
        SELECT spotify_track_id FROM spotify_youtube_map
        ORDER BY resolved_at ASC
        LIMIT ?
      )
    `).run(count - MAX_MAPPINGS);
  }
}

export function removeYoutubeMapping(spotifyTrackId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM spotify_youtube_map WHERE spotify_track_id = ?').run(spotifyTrackId);
}

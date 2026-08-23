/**
 * lib/storage/db.ts
 *
 * SQLite singleton using Node.js built-in `node:sqlite` (DatabaseSync).
 * No npm packages needed — requires Node.js >= 22.
 *
 * Database file: DATA_DIR/music.db
 * Tables: playlists, tracks, playlist_tracks, user_settings, spotify_youtube_map
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { getDataDir } from '@/lib/nativeData';

let _db: DatabaseSync | null = null;

export function getDbPath(): string {
  return path.join(path.resolve(getDataDir()), 'music.db');
}

export function getDb(): DatabaseSync {
  if (_db) return _db;
  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  _db = new DatabaseSync(dbPath);
  // Never let a second process (for example a database viewer in VS Code)
  // freeze the Electron UI while SQLite waits for its file lock.
  _db.exec('PRAGMA busy_timeout = 1500');
  // WAL mode improves concurrent reads, but changing journal mode needs an
  // exclusive lock. Treat that optimization as best-effort at startup.
  try {
    _db.exec('PRAGMA journal_mode = WAL');
  } catch (error) {
    console.warn('[db] WAL mode unavailable; continuing with the existing journal mode:', error instanceof Error ? error.message : error);
  }
  _db.exec('PRAGMA foreign_keys = ON');
  _db.exec('PRAGMA synchronous = NORMAL');
  initSchema(_db);
  return _db;
}

/** Close and reopen the DB (useful for testing). */
export function closeDb(): void {
  if (_db) {
    try { _db.close(); } catch {}
    _db = null;
  }
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS playlists (
      id                 TEXT PRIMARY KEY,
      title              TEXT NOT NULL,
      description        TEXT NOT NULL DEFAULT '',
      thumbnail_url      TEXT NOT NULL DEFAULT '',
      track_count        INTEGER NOT NULL DEFAULT 0,
      source             TEXT,
      source_url         TEXT,
      source_playlist_id TEXT,
      source_revision    TEXT,
      sync_status        TEXT NOT NULL DEFAULT 'idle',
      sync_error         TEXT,
      last_synced_at     TEXT,
      imported_at        TEXT,
      sync_on_open       INTEGER NOT NULL DEFAULT 0,
      created_at         TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_playlists_title
      ON playlists(title);

    CREATE TABLE IF NOT EXISTS tracks (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id        TEXT NOT NULL DEFAULT '',
      source_track_id TEXT NOT NULL DEFAULT '',
      title           TEXT NOT NULL,
      artist          TEXT NOT NULL DEFAULT '',
      album           TEXT,
      duration        INTEGER,
      source          TEXT,
      date_added      TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_identity
      ON tracks(video_id, source_track_id);

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id      TEXT    NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      track_id         INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      position         INTEGER NOT NULL DEFAULT 0,
      playlist_item_id TEXT,
      thumbnail_url    TEXT,
      PRIMARY KEY (playlist_id, track_id)
    );

    CREATE INDEX IF NOT EXISTS idx_pt_playlist_pos
      ON playlist_tracks(playlist_id, position);

    CREATE TABLE IF NOT EXISTS user_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      provider     TEXT NOT NULL,
      account_id   TEXT NOT NULL,
      name         TEXT NOT NULL DEFAULT '',
      email        TEXT NOT NULL DEFAULT '',
      picture_url  TEXT NOT NULL DEFAULT '',
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL,
      PRIMARY KEY (provider, account_id)
    );

    CREATE TABLE IF NOT EXISTS spotify_youtube_map (
      spotify_track_id TEXT PRIMARY KEY,
      youtube_video_id TEXT NOT NULL,
      matched_title    TEXT,
      matched_artist   TEXT,
      duration         INTEGER,
      resolved_at      INTEGER NOT NULL,
      match_method     TEXT
    );
  `);

  // Safe migration for existing databases
  try {
    db.exec('ALTER TABLE playlists ADD COLUMN sync_on_open INTEGER NOT NULL DEFAULT 0;');
  } catch {
    // Column already exists
  }
}

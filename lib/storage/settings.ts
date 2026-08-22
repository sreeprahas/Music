/**
 * lib/storage/settings.ts
 *
 * User settings repository backed by SQLite (user_settings table).
 * Settings are stored as JSON blobs keyed by user email (lowercased).
 */

import { getDb } from './db';
import type { Track } from '@/types';

export interface UserSettings {
  importedPlaylists: string[];
  hiddenPlaylists: string[];
  pinnedPlaylists: string[];
  playlistOrder: string[];
  unpinnedPlaylistOrder?: string[];
  hiddenPinnedPlaylists?: string[];
  volume: number;
  isMuted: boolean;
  isShuffle: boolean;
  repeatMode: string;
  queueWidth?: number;
  lyricsWidth?: number;
  spotifySyncWarningDismissed?: boolean;
  playbackSession?: {
    track: Track | null;
    queue: Track[];
    time: number;
    volume: number;
    isMuted: boolean;
    isShuffle: boolean;
    repeatMode: string;
    isQueueOpen: boolean;
    isLyricsOpen: boolean;
  } | null;
}

export const DEFAULT_SETTINGS: UserSettings = {
  importedPlaylists: [],
  hiddenPlaylists: [],
  pinnedPlaylists: [],
  playlistOrder: [],
  volume: 1,
  isMuted: false,
  isShuffle: false,
  repeatMode: 'off',
  spotifySyncWarningDismissed: false,
  playbackSession: null,
};

function settingsKey(email: string): string {
  return (email || 'default').toLowerCase().trim() || 'default';
}

export function getUserSettings(email: string): UserSettings {
  const db = getDb();
  const key = settingsKey(email);
  const row = db.prepare('SELECT value FROM user_settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveUserSettings(email: string, settings: Partial<UserSettings>): UserSettings {
  const db = getDb();
  const key = settingsKey(email);
  const current = getUserSettings(email);
  const updated: UserSettings = { ...current, ...settings };
  db.prepare(`
    INSERT INTO user_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, JSON.stringify(updated));
  return updated;
}

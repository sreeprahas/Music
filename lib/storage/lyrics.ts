/** Filesystem lyrics cache shared by the lyrics endpoint. */

import fs from 'fs';
import path from 'path';
import { getDataDir } from '@/lib/nativeData';
import { cleanArtistName } from '@/lib/ytmusicFormat';

function getLyricsDir(): string {
  return path.join(path.resolve(getDataDir()), 'lyrics');
}

export function getLyricsPath(artist: string, title: string): string {
  const cleanedArtist = cleanArtistName(artist);
  const safeName = `${cleanedArtist}_${title}`.replace(/[/\\?%*:|"<>]/g, '-').toLowerCase();
  return path.join(getLyricsDir(), `${safeName}.json`);
}

export function getSavedLyrics(artist: string, title: string): unknown {
  const filePath = getLyricsPath(artist, title);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveLyrics(artist: string, title: string, data: unknown): void {
  const filePath = getLyricsPath(artist, title);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function deleteSavedLyrics(artist: string, title: string): void {
  try {
    fs.rmSync(getLyricsPath(artist, title), { force: true });
  } catch {
    // Cache cleanup must never prevent playlist deletion.
  }
}

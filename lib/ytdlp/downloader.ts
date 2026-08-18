/**
 * yt-dlp download facade.
 *
 * This module re-exports the existing download infrastructure from
 * `lib/downloader.ts`. The actual download logic (MP3 conversion, thumbnail
 * extraction, fallback search, retry) is preserved there — this facade simply
 * gives the yt-dlp media-resolution layer a single import surface so callers
 * don't need to know which file the implementation lives in.
 *
 * Security: the underlying `downloadTrack` uses `execFile` with an argument
 * ARRAY — never shell interpolation. User-controlled values (title, artist)
 * are passed as individual arguments.
 */

export {
  ensureMp3Dir,
  getMp3Path,
  isDownloaded,
  deleteTrack,
  downloadTrack,
} from '../downloader';

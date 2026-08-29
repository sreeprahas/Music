/**
 * lib/youtube/validation.ts
 *
 * Validation and parsing for YouTube / YouTube Music playlist and track URLs.
 */

const YOUTUBE_HOSTNAMES = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

const PLAYLIST_ID_REGEX = /^[A-Za-z0-9_-]{10,64}$/;
const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

/**
 * Validates whether a raw string is a valid YouTube or YouTube Music URL.
 */
export function isYouTubeUrl(rawUrl: string): boolean {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? YOUTUBE_HOSTNAMES.has(parsed.hostname.toLowerCase())
      : false;
  } catch {
    return false;
  }
}

/**
 * Validates whether a URL is a YouTube or YouTube Music playlist URL.
 */
export function isYouTubePlaylistUrl(rawUrl: string): boolean {
  if (!isYouTubeUrl(rawUrl)) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    const listParam = parsed.searchParams.get('list');
    if (listParam && isValidPlaylistId(listParam)) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Validates whether a playlist ID string is well-formed.
 */
export function isValidPlaylistId(id: string): boolean {
  return typeof id === 'string' && PLAYLIST_ID_REGEX.test(id);
}

/**
 * Validates whether a video ID string is well-formed.
 */
export function isValidVideoId(id: string): boolean {
  return typeof id === 'string' && VIDEO_ID_REGEX.test(id);
}

/**
 * Extracts and validates playlist ID from a URL or raw ID string.
 */
export function extractYouTubePlaylistId(input: string): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (isValidPlaylistId(trimmed)) return trimmed;

  if (!isYouTubeUrl(trimmed)) return null;

  try {
    const parsed = new URL(trimmed);
    const list = parsed.searchParams.get('list');
    if (list && isValidPlaylistId(list)) return list;
    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts and validates a YouTube video ID from a URL or raw ID string.
 */
export function extractYouTubeVideoId(input: string): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (isValidVideoId(trimmed)) return trimmed;

  if (!isYouTubeUrl(trimmed)) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.toLowerCase() === 'youtu.be') {
      const id = parsed.pathname.replace(/^\/+/, '');
      if (isValidVideoId(id)) return id;
    }
    const v = parsed.searchParams.get('v');
    if (v && isValidVideoId(v)) return v;
    return null;
  } catch {
    return null;
  }
}

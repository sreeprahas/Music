import { exec, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { promisify } from 'util';
import { Track } from '../src/types.js';

const execAsync = promisify(exec);
const BIN_DIR = path.join(process.cwd(), 'bin');
const YTDLP_BIN = path.join(BIN_DIR, 'yt-dlp');
const FALLBACK_TMP_YTDLP = '/tmp/yt-dlp';

let activeYtdlpPath: string | null = null;

export async function ensureYtdlpBinary(): Promise<string> {
  if (activeYtdlpPath && fs.existsSync(activeYtdlpPath)) {
    return activeYtdlpPath;
  }

  // Check system PATH
  try {
    const { stdout } = await execAsync('which yt-dlp');
    const sysPath = stdout.trim();
    if (sysPath && fs.existsSync(sysPath)) {
      activeYtdlpPath = sysPath;
      return sysPath;
    }
  } catch (_) {
    // not in path
  }

  // Check /tmp/yt-dlp
  if (fs.existsSync(FALLBACK_TMP_YTDLP)) {
    activeYtdlpPath = FALLBACK_TMP_YTDLP;
    return FALLBACK_TMP_YTDLP;
  }

  // Check local bin/yt-dlp
  if (fs.existsSync(YTDLP_BIN)) {
    activeYtdlpPath = YTDLP_BIN;
    return YTDLP_BIN;
  }

  // Download latest yt-dlp standalone binary
  console.log('[yt-dlp] Downloading standalone binary...');
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  const targetPath = YTDLP_BIN;
  await new Promise<void>((resolve, reject) => {
    const file = fs.createWriteStream(targetPath);
    https.get('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp', (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        https.get(res.headers.location!, (redirectRes) => {
          redirectRes.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }).on('error', reject);
      } else {
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }
    }).on('error', reject);
  });

  fs.chmodSync(targetPath, 0o755);
  activeYtdlpPath = targetPath;
  console.log('[yt-dlp] Binary installed at', targetPath);
  return targetPath;
}

function extractVideoId(input: string): string {
  if (input.length === 11 && !input.includes('/') && !input.includes('.')) {
    return input;
  }
  const match = input.match(/(?:v=|\/embed\/|\/1\/|\/v\/|https:\/\/youtu\.be\/|\/shorts\/|\/live\/)([a-zA-Z0-9_-]{11})/);
  if (match && match[1]) {
    return match[1];
  }
  return input;
}

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '3:30';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export async function fetchTrackInfo(urlOrVideoId: string): Promise<Track> {
  const bin = await ensureYtdlpBinary();
  const videoId = extractVideoId(urlOrVideoId);
  const target = videoId.length === 11 ? `https://www.youtube.com/watch?v=${videoId}` : urlOrVideoId;

  const cmd = `"${bin}" --extractor-args "youtube:player_client=android,web" -j --no-playlist "${target}"`;
  const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });

  const info = JSON.parse(stdout.trim());
  const dur = info.duration || 0;

  return {
    id: info.id || videoId,
    videoId: info.id || videoId,
    title: info.title || 'Unknown Title',
    artist: info.artist || info.uploader || info.channel || 'Unknown Artist',
    thumbnailUrl: info.thumbnail || `https://i.ytimg.com/vi/${info.id || videoId}/hqdefault.jpg`,
    duration: dur,
    durationFormatted: formatDuration(dur),
    addedAt: new Date().toISOString(),
    liked: false,
  };
}

export async function getDirectAudioStreamUrl(videoId: string): Promise<string> {
  const bin = await ensureYtdlpBinary();
  const target = `https://www.youtube.com/watch?v=${videoId}`;
  const cmd = `"${bin}" --extractor-args "youtube:player_client=android,web" -f "ba/b" -g "${target}"`;

  const { stdout } = await execAsync(cmd);
  const url = stdout.trim().split('\n')[0];
  if (!url) {
    throw new Error(`Failed to extract audio URL for video ${videoId}`);
  }
  return url;
}

export async function searchYoutubeTracks(query: string, limit = 8): Promise<Track[]> {
  const bin = await ensureYtdlpBinary();
  const searchPattern = `ytsearch${limit}:${query.replace(/"/g, '')}`;
  const cmd = `"${bin}" --extractor-args "youtube:player_client=android,web" -j --no-playlist "${searchPattern}"`;

  try {
    const { stdout } = await execAsync(cmd, { maxBuffer: 15 * 1024 * 1024 });
    const lines = stdout.trim().split('\n').filter(Boolean);

    const tracks: Track[] = [];
    for (const line of lines) {
      try {
        const info = JSON.parse(line);
        const dur = info.duration || 0;
        tracks.push({
          id: info.id,
          videoId: info.id,
          title: info.title || 'Unknown Title',
          artist: info.artist || info.uploader || info.channel || 'Unknown Artist',
          thumbnailUrl: info.thumbnail || `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`,
          duration: dur,
          durationFormatted: formatDuration(dur),
          addedAt: new Date().toISOString(),
          liked: false,
        });
      } catch (e) {
        // ignore parse line error
      }
    }
    return tracks;
  } catch (err) {
    console.error('Error during yt-dlp search:', err);
    return [];
  }
}

export async function createAudioStreamProcess(videoId: string) {
  const bin = await ensureYtdlpBinary();
  const target = `https://www.youtube.com/watch?v=${videoId}`;

  // Spawn yt-dlp piping stdout directly as mp3/webm/m4a audio stream
  const child = spawn(
    bin,
    [
      '--extractor-args',
      'youtube:player_client=android,web',
      '-f',
      'ba/b',
      '-o',
      '-',
      target,
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] }
  );

  return child;
}

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { getLocalThumbnailPath, ensureDirs } from './db';
import { getDataDir } from './nativeData';

function getMp3Dir() {
  return path.join(getDataDir(), 'mp3');
}

function getYtdlpPath() {
  if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) return process.env.YTDLP_PATH;
  const bundled = path.join(process.cwd(), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  return fs.existsSync(bundled) ? bundled : 'yt-dlp';
}

export function ensureMp3Dir(): void {
  ensureDirs();
  const MP3_DIR = getMp3Dir();
  if (!fs.existsSync(MP3_DIR)) {
    fs.mkdirSync(MP3_DIR, { recursive: true });
  }
}

export function getMp3Path(videoId: string): string {
  return path.join(getMp3Dir(), `${videoId}.mp3`);
}

export function isDownloaded(videoId: string): boolean {
  try {
    const p = getMp3Path(videoId);
    const stat = fs.existsSync(p) ? fs.statSync(p) : null;
    return stat !== null && stat.size > 8192; // > 8KB = valid MP3
  } catch {
    return false;
  }
}

export function deleteTrack(videoId: string): boolean {
  try {
    const p = getMp3Path(videoId);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
    return true;
  } catch (err) {
    console.error(`[downloader] Failed to delete track ${videoId}:`, err);
    return false;
  }
}

export function downloadTrack(
  videoId: string,
  title?: string,
  artist?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureMp3Dir();
    const MP3_DIR = getMp3Dir();
    const outputTemplate = path.join(MP3_DIR, `${videoId}.%(ext)s`).replace(/\\/g, '/');
    const directUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const ytdlp = getYtdlpPath();

    // SECURITY: execFile with argument array — no shell interpolation.
    // User-controlled values (title, artist) are never passed to a shell.
    const directArgs = [
      '-x', '--audio-format', 'mp3', '--audio-quality', '0',
      '--write-thumbnail', '--convert-thumbnails', 'webp',
      '--no-playlist', '--no-warnings', '--retries', '2',
      '--concurrent-fragments', '4',
      '--extractor-args', 'youtube:player_client=android,web',
      '-o', outputTemplate,
      directUrl,
    ];

    execFile(ytdlp, directArgs, { timeout: 120000 }, (error, _stdout, stderr) => {
      // Move thumbnail if it exists
      const tempThumb = path.join(getMp3Dir(), `${videoId}.webp`);
      const finalThumb = getLocalThumbnailPath(videoId);
      if (fs.existsSync(tempThumb)) {
        fs.renameSync(tempThumb, finalThumb);
      }

      if (isDownloaded(videoId)) {
        resolve();
        return;
      }

      // If direct URL download failed (e.g. YT Music Premium exclusive track), try YouTube search fallback.
      // The query is passed as a single argument to yt-dlp — never through a shell.
      const query = [artist, title, 'audio'].filter(Boolean).join(' ');
      if (!query || query.trim() === 'audio') {
        reject(new Error(`yt-dlp failed for ${videoId}: ${stderr || error?.message}`));
        return;
      }

      console.log(`[downloader] Direct download failed for ${videoId}. Attempting fallback search: "${query}"`);
      const searchArgs = [
        '-x', '--audio-format', 'mp3', '--audio-quality', '0',
        '--write-thumbnail', '--convert-thumbnails', 'webp',
        '--no-playlist', '--no-warnings', '--retries', '2',
        '--concurrent-fragments', '4',
        '-o', outputTemplate,
        `ytsearch1:${query}`,
      ];

      execFile(ytdlp, searchArgs, { timeout: 300000 }, (searchErr, _sOut, sErr) => {
        // Move thumbnail if it exists
        if (fs.existsSync(tempThumb)) {
          fs.renameSync(tempThumb, finalThumb);
        }

        if (isDownloaded(videoId)) {
          resolve();
        } else {
          reject(
            new Error(
              `yt-dlp failed for ${videoId} (both direct & search fallback): ${sErr || searchErr?.message}`
            )
          );
        }
      });
    });
  });
}

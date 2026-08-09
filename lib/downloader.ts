import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { getLocalThumbnailPath, ensureDirs } from './db';
import { getDataDir } from './nativeData';

function getMp3Dir() {
  return path.join(getDataDir(), 'mp3');
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
    const directCmd = `yt-dlp -x --audio-format mp3 --audio-quality 0 --postprocessor-args "ffmpeg:-af loudnorm=I=-14:LRA=11:TP=-1.5" --write-thumbnail --convert-thumbnails webp --no-playlist --no-warnings --retries 3 --extractor-args "youtube:player_client=android,web" -o "${outputTemplate}" "${directUrl}"`;

    exec(directCmd, { timeout: 300000 }, (error, _stdout, stderr) => {
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

      // If direct URL download failed (e.g. YT Music Premium exclusive track), try YouTube search fallback
      const query = [artist, title, 'audio'].filter(Boolean).join(' ');
      if (!query || query.trim() === 'audio') {
        reject(new Error(`yt-dlp failed for ${videoId}: ${stderr || error?.message}`));
        return;
      }

      console.log(`[downloader] Direct download failed for ${videoId}. Attempting fallback search: "${query}"`);
      const searchUrl = `ytsearch1:${query.replace(/"/g, '')}`;
      const searchCmd = `yt-dlp -x --audio-format mp3 --audio-quality 0 --postprocessor-args "ffmpeg:-af loudnorm=I=-14:LRA=11:TP=-1.5" --write-thumbnail --convert-thumbnails webp --no-playlist --no-warnings --retries 3 -o "${outputTemplate}" "${searchUrl}"`;

      exec(searchCmd, { timeout: 300000 }, (searchErr, _sOut, sErr) => {
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

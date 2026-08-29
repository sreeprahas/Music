/**
 * lib/youtube/ytdlp.ts
 *
 * Lightweight, safe child-process runner for the yt-dlp executable.
 * Strictly uses spawn() with argument arrays (no shell interpretation / command injection).
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export class YtDlpError extends Error {
  constructor(
    message: string,
    public readonly exitCode?: number | null,
    public readonly stderr?: string,
  ) {
    super(message);
    this.name = 'YtDlpError';
  }
}

export class YtDlpNotFoundError extends YtDlpError {
  constructor(message = 'yt-dlp executable not found on system') {
    super(message, null, '');
    this.name = 'YtDlpNotFoundError';
  }
}

export class YtDlpTimeoutError extends YtDlpError {
  constructor(timeoutMs: number) {
    super(`yt-dlp execution timed out after ${timeoutMs}ms`, null, '');
    this.name = 'YtDlpTimeoutError';
  }
}

/**
 * Resolves the path to the yt-dlp executable.
 * Priority:
 * 1. Process environment override `YTDLP_PATH`
 * 2. Packaged electron resources path (if packaged)
 * 3. System PATH ('yt-dlp' or 'yt-dlp.exe')
 */
export function resolveYtDlpPath(): string {
  if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) {
    return process.env.YTDLP_PATH;
  }

  // Check packaged electron resource path if applicable
  const resourcesPath = (process as any).resourcesPath;
  if (resourcesPath) {
    const packagedWin = path.join(resourcesPath, 'bin', 'yt-dlp.exe');
    if (fs.existsSync(packagedWin)) return packagedWin;
    const packagedPosix = path.join(resourcesPath, 'bin', 'yt-dlp');
    if (fs.existsSync(packagedPosix)) return packagedPosix;
  }

  return process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
}

export interface YtDlpExecOptions {
  args: string[];
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBufferBytes?: number;
}

export interface YtDlpResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Executes yt-dlp with an argument array and returns captured stdout/stderr.
 */
export function execYtDlp(options: YtDlpExecOptions): Promise<YtDlpResult> {
  const { args, signal, timeoutMs = 30_000, maxBufferBytes = 10 * 1024 * 1024 } = options;
  const executable = resolveYtDlpPath();

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error('Operation cancelled'));
    }

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(executable, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return reject(new YtDlpNotFoundError());
      }
      return reject(new YtDlpError(err.message || 'Failed to spawn yt-dlp'));
    }

    let stdout = '';
    let stderr = '';
    let bytesReceived = 0;
    let timedOut = false;

    let timeoutId: NodeJS.Timeout | null = null;
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        try {
          child.kill('SIGTERM');
        } catch {}
      }, timeoutMs);
    }

    const abortHandler = () => {
      try {
        child.kill('SIGTERM');
      } catch {}
    };

    if (signal) {
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      bytesReceived += chunk.length;
      if (bytesReceived > maxBufferBytes) {
        try {
          child.kill('SIGTERM');
        } catch {}
        return reject(new YtDlpError('yt-dlp output exceeded maximum buffer limit'));
      }
      stdout += chunk.toString('utf-8');
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    child.on('error', (err: any) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', abortHandler);
      if (err.code === 'ENOENT') {
        return reject(new YtDlpNotFoundError());
      }
      reject(new YtDlpError(err.message, null, stderr));
    });

    child.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', abortHandler);

      if (timedOut) {
        return reject(new YtDlpTimeoutError(timeoutMs));
      }

      if (signal?.aborted) {
        return reject(new Error('Operation cancelled'));
      }

      if (code !== 0 && code !== null) {
        return reject(new YtDlpError(stderr.trim() || `yt-dlp exited with code ${code}`, code, stderr));
      }

      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });
  });
}

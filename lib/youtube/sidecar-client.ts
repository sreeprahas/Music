/**
 * lib/youtube/sidecar-client.ts
 *
 * Persistent Python sidecar client for ytmusicapi.
 * Manages the Python process lifecycle, line-delimited JSON-RPC over stdin/stdout,
 * timeouts, automatic crash recovery with bounded backoff, and clean shutdown.
 */

import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import type { SidecarRequest, SidecarResponse, SidecarStatus } from './types';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
  operation: string;
}

class YouTubeSidecarClient {
  private child: ChildProcess | null = null;
  private stdoutReader: readline.Interface | null = null;
  private pending = new Map<string, PendingRequest>();
  private requestCounter = 0;
  private isShuttingDown = false;
  private isStarting = false;
  private startPromise: Promise<void> | null = null;
  private restartAttempts = 0;
  private maxRestarts = 5;
  private lastRestartTime = 0;
  private dataDir: string;
  private authFilePath: string;

  constructor() {
    this.dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    this.authFilePath = process.env.YTMUSIC_AUTH_FILE || path.join(this.dataDir, 'ytmusic_auth.json');
    this.installExitHandlers();
  }

  public getAuthFilePath(): string {
    return this.authFilePath;
  }

  private installExitHandlers(): void {
    const handleExit = () => {
      this.shutdownSync();
    };
    process.once('exit', handleExit);
    process.once('SIGINT', handleExit);
    process.once('SIGTERM', handleExit);
  }

  private resolvePythonExecutable(): string {
    if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
      return process.env.PYTHON_PATH;
    }

    const appRoot = process.cwd();
    // Windows virtualenv
    const venvWin = path.join(appRoot, '.venv', 'Scripts', 'python.exe');
    if (fs.existsSync(venvWin)) return venvWin;

    // Unix virtualenv
    const venvPosix = path.join(appRoot, '.venv', 'bin', 'python');
    if (fs.existsSync(venvPosix)) return venvPosix;

    // Packaged Electron runtime fallback
    const resourcesPath = (process as any).resourcesPath as string | undefined;
    if (resourcesPath) {
      const packagedPython = path.join(resourcesPath, 'python', 'python.exe');
      if (fs.existsSync(packagedPython)) return packagedPython;
    }

    // Default to system python
    return process.platform === 'win32' ? 'python.exe' : 'python3';
  }

  private resolveSidecarScript(): string {
    const appRoot = process.cwd();
    const localScript = path.join(appRoot, 'services', 'ytmusic', 'sidecar.py');
    if (fs.existsSync(localScript)) return localScript;

    const resourcesPath = (process as any).resourcesPath as string | undefined;
    if (resourcesPath) {
      const packagedScript = path.join(resourcesPath, 'services', 'ytmusic', 'sidecar.py');
      if (fs.existsSync(packagedScript)) return packagedScript;
    }

    return localScript;
  }

  public async ensureReady(): Promise<void> {
    if (this.child && !this.child.killed && this.child.exitCode === null) {
      return;
    }
    if (this.isStarting && this.startPromise) {
      return this.startPromise;
    }
    this.startPromise = this.start();
    return this.startPromise;
  }

  private async start(): Promise<void> {
    this.isStarting = true;
    try {
      const pythonExe = this.resolvePythonExecutable();
      const sidecarScript = this.resolveSidecarScript();

      if (!fs.existsSync(sidecarScript)) {
        throw new Error(`YTMusic sidecar script not found at: ${sidecarScript}`);
      }

      fs.mkdirSync(path.dirname(this.authFilePath), { recursive: true });

      const args = [
        sidecarScript,
        '--auth-file',
        this.authFilePath,
      ];

      const env = {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
        YTMUSIC_AUTH_FILE: this.authFilePath,
      };

      console.log(`[ytmusic-sidecar] Spawning Python sidecar: ${pythonExe} ${sidecarScript}`);

      this.child = spawn(pythonExe, args, {
        cwd: process.cwd(),
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      this.stdoutReader = readline.createInterface({
        input: this.child.stdout!,
        terminal: false,
      });

      this.stdoutReader.on('line', (line: string) => {
        this.handleStdoutLine(line);
      });

      this.child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8').trim();
        if (text) {
          console.log(`[ytmusic:sidecar:log] ${text}`);
        }
      });

      this.child.on('error', (err: Error) => {
        console.error('[ytmusic-sidecar] Process error:', err);
      });

      this.child.on('exit', (code: number | null, signal: string | null) => {
        console.warn(`[ytmusic-sidecar] Process exited with code ${code}, signal ${signal}`);
        this.handleProcessExit(code);
      });

      // Send a ping to verify readiness
      const pingResponse = await this.execute<{ status: string }>('ping', {}, 10_000);
      if (pingResponse?.status !== 'ready') {
        throw new Error('Sidecar ping did not return ready status');
      }

      console.log('[ytmusic-sidecar] Sidecar is ready and validated');
      this.restartAttempts = 0;
    } finally {
      this.isStarting = false;
      this.startPromise = null;
    }
  }

  private handleStdoutLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const response: SidecarResponse = JSON.parse(trimmed);
      const pending = this.pending.get(response.requestId);
      if (!pending) return;

      clearTimeout(pending.timer);
      this.pending.delete(response.requestId);

      if (response.success) {
        pending.resolve(response.data);
      } else {
        const err = new Error(response.error || `Sidecar error in operation ${pending.operation}`);
        (err as any).errorType = response.errorType;
        pending.reject(err);
      }
    } catch (parseErr) {
      console.error('[ytmusic-sidecar] Failed to parse stdout line:', trimmed, parseErr);
    }
  }

  private handleProcessExit(_code: number | null): void {
    this.stdoutReader?.close();
    this.stdoutReader = null;
    this.child = null;

    // Reject all pending requests
    const pendingRequests = Array.from(this.pending.values());
    this.pending.clear();
    for (const req of pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error('YouTube Music sidecar process exited unexpectedly'));
    }

    if (this.isShuttingDown) return;

    // Automatic restart with exponential backoff
    const now = Date.now();
    if (now - this.lastRestartTime > 60_000) {
      this.restartAttempts = 0;
    }
    this.lastRestartTime = now;

    if (this.restartAttempts < this.maxRestarts) {
      this.restartAttempts++;
      const delayMs = Math.min(500 * Math.pow(2, this.restartAttempts - 1), 5000);
      console.log(`[ytmusic-sidecar] Scheduling restart attempt ${this.restartAttempts}/${this.maxRestarts} in ${delayMs}ms`);
      setTimeout(() => {
        if (!this.isShuttingDown) {
          this.ensureReady().catch((err) => {
            console.error('[ytmusic-sidecar] Restart attempt failed:', err);
          });
        }
      }, delayMs);
    } else {
      console.error('[ytmusic-sidecar] Exceeded maximum restart attempts. Sidecar halted.');
    }
  }

  public async execute<T = any>(
    operation: string,
    args: Record<string, unknown> = {},
    timeoutMs = 15_000,
    signal?: AbortSignal,
  ): Promise<T> {
    await this.ensureReady();

    if (!this.child || !this.child.stdin || this.child.stdin.destroyed) {
      throw new Error('YouTube Music sidecar process is not running');
    }

    if (signal?.aborted) {
      throw new Error('Operation aborted');
    }

    const requestId = String(++this.requestCounter);
    const payload: SidecarRequest = {
      requestId,
      operation,
      arguments: args,
    };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`YouTube Music sidecar timeout after ${timeoutMs}ms (operation: ${operation})`));
      }, timeoutMs);

      const onAbort = () => {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(new Error(`Operation ${operation} was aborted`));
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      this.pending.set(requestId, {
        resolve: (val) => {
          if (signal) signal.removeEventListener('abort', onAbort);
          resolve(val);
        },
        reject: (err) => {
          if (signal) signal.removeEventListener('abort', onAbort);
          reject(err);
        },
        timer,
        operation,
      });

      try {
        this.child!.stdin!.write(JSON.stringify(payload) + '\n', 'utf-8');
      } catch (writeErr) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(new Error(`Failed to write to sidecar stdin: ${writeErr instanceof Error ? writeErr.message : writeErr}`));
      }
    });
  }

  public async getStatus(): Promise<SidecarStatus> {
    try {
      const ping = await this.execute<SidecarStatus>('ping', {}, 5000);
      return {
        status: 'ready',
        authenticated: ping.authenticated,
        authFile: ping.authFile || this.authFilePath,
        version: ping.version,
      };
    } catch (err) {
      return {
        status: 'error',
        authenticated: false,
        authFile: this.authFilePath,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  public async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    const child = this.child;
    this.child = null;

    if (!child) return;

    try {
      await this.execute('shutdown', {}, 2000).catch(() => {});
    } catch {}

    try {
      child.kill('SIGTERM');
    } catch {}

    if (process.platform === 'win32' && child.pid) {
      try {
        const { execSync } = require('child_process');
        execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
      } catch {}
    }
  }

  private shutdownSync(): void {
    this.isShuttingDown = true;
    if (this.child && !this.child.killed) {
      try {
        if (process.platform === 'win32' && this.child.pid) {
          const { execSync } = require('child_process');
          execSync(`taskkill /pid ${this.child.pid} /T /F`, { stdio: 'ignore' });
        } else {
          this.child.kill('SIGKILL');
        }
      } catch {}
    }
  }
}

export const youtubeSidecar = new YouTubeSidecarClient();

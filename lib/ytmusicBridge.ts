import { spawn } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';

type Token = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

type OAuth = { client_id: string; client_secret: string };

function sidecarCommand(): { command: string; args: string[]; env?: NodeJS.ProcessEnv } {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const executable = process.env.YTMUSIC_SIDECAR_PATH || (resourcesPath ? path.join(resourcesPath, 'ytmusic-sidecar.exe') : path.join(process.cwd(), 'services', 'ytmusic-sidecar.exe'));
  if (existsSync(executable)) return { command: executable, args: [] };
  const python = process.env.YTMUSIC_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  return { command: python, args: [path.join(process.cwd(), 'services', 'ytmusic_service.py')], env: { ...process.env, PYTHONPATH: process.env.YTMUSIC_PYTHONPATH } };
}

export async function ytmusicCall<T>(request: Record<string, unknown>): Promise<T> {
  const command = sidecarCommand();
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, { env: command.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    let errors = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { errors += chunk; });
    child.once('error', (error) => reject(new Error(`ytmusic sidecar unavailable: ${error.message}`)));
    child.once('close', (code) => {
      if (!output.trim()) return reject(new Error(errors.trim() || `ytmusic sidecar exited with code ${code}`));
      try {
        const response = JSON.parse(output.trim()) as { ok: boolean; result?: T; error?: string };
        if (!response.ok) return reject(new Error(response.error || 'ytmusicapi request failed'));
        resolve(response.result as T);
      } catch { reject(new Error('ytmusic sidecar returned invalid JSON')); }
    });
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

export function oauthConfig(): OAuth {
  const client_id = process.env.GOOGLE_CLIENT_ID;
  const client_secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!client_id || !client_secret) throw new Error('Google OAuth client credentials are not configured');
  return { client_id: client_id.trim(), client_secret: client_secret.trim() };
}

export function tokenFromSession(session: { accessToken: string; refreshToken: string; expiresAt: number }): Token {
  return { access_token: session.accessToken, refresh_token: session.refreshToken, expires_at: Math.floor(session.expiresAt / 1000) };
}

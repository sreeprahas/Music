import fs from 'fs';
import path from 'path';
import { getDataDir } from './nativeData';
import { refreshAccessToken } from './auth';
import type { SessionData } from '@/types';

type PlaylistCommand = {
  id: string;
  operation: 'add' | 'remove';
  playlistId: string;
  videoId: string;
  playlistItemId?: string;
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  status: 'pending' | 'processing';
};

type QueueFile = { commands: PlaylistCommand[] };

let processing = false;

function queuePath() {
  return path.join(path.resolve(getDataDir()), 'playlist_commands.json');
}

function ensureQueueFile() {
  const file = queuePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ commands: [] }, null, 2), 'utf8');
  return file;
}

function readQueue(): QueueFile {
  try {
    const data = JSON.parse(fs.readFileSync(ensureQueueFile(), 'utf8')) as QueueFile;
    const commands = Array.isArray(data.commands) ? data.commands : [];
    return { commands: commands.map((command) => ({ ...command, status: 'pending' })) };
  } catch {
    return { commands: [] };
  }
}

function writeQueue(queue: QueueFile) {
  const file = ensureQueueFile();
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(queue, null, 2), 'utf8');
  fs.renameSync(temporary, file);
}

function commandMatches(a: PlaylistCommand, b: PlaylistCommand) {
  return a.operation === b.operation && a.playlistId === b.playlistId && a.videoId === b.videoId;
}

export function enqueuePlaylistCommand(
  session: SessionData,
  command: Pick<PlaylistCommand, 'operation' | 'playlistId' | 'videoId' | 'playlistItemId'>
) {
  const queue = readQueue();
  const existing = queue.commands.find((item) => commandMatches(item, command as PlaylistCommand));
  if (existing) return existing;

  const queued: PlaylistCommand = {
    ...command,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    refreshToken: session.refreshToken,
    accessToken: session.accessToken,
    expiresAt: session.expiresAt,
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: 0,
    status: 'pending',
  };
  queue.commands.push(queued);
  writeQueue(queue);
  return queued;
}

async function getAccessToken(command: PlaylistCommand) {
  if (command.accessToken && command.expiresAt > Date.now() + 60_000) {
    return command.accessToken;
  }
  const refreshed = await refreshAccessToken(command.refreshToken);
  if (!refreshed) throw new Error('Could not refresh playlist queue authentication');
  command.accessToken = refreshed.accessToken;
  command.expiresAt = refreshed.expiresAt;
  return command.accessToken;
}

async function executeCommand(command: PlaylistCommand) {
  const accessToken = await getAccessToken(command);
  const headers = { Authorization: `Bearer ${accessToken}` };

  if (command.operation === 'add') {
    const lookup = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    lookup.searchParams.set('part', 'id');
    lookup.searchParams.set('playlistId', command.playlistId);
    lookup.searchParams.set('videoId', command.videoId);
    lookup.searchParams.set('maxResults', '50');
    const existing = await fetch(lookup.toString(), { headers });
    if (!existing.ok) throw new Error(`Playlist add lookup failed (${existing.status})`);
    const data = await existing.json().catch(() => ({}));
    if (Array.isArray(data.items) && data.items.length > 0) return;

    const response = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snippet: {
          playlistId: command.playlistId,
          resourceId: { kind: 'youtube#video', videoId: command.videoId },
        },
      }),
    });
    if (!response.ok) throw new Error(`Playlist add failed (${response.status})`);
    return;
  }

  const lookup = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  lookup.searchParams.set('part', 'id');
  lookup.searchParams.set('playlistId', command.playlistId);
  lookup.searchParams.set('videoId', command.videoId);
  lookup.searchParams.set('maxResults', '50');
  const existing = command.playlistItemId
    ? { items: [{ id: command.playlistItemId }] }
    : await fetch(lookup.toString(), { headers }).then(async (response) => {
      if (!response.ok) throw new Error(`Playlist remove lookup failed (${response.status})`);
      return response.json().catch(() => ({}));
    });

  for (const item of existing.items ?? []) {
    if (!item.id) continue;
    const response = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?id=${encodeURIComponent(item.id)}`, {
      method: 'DELETE',
      headers,
    });
    if (!response.ok && response.status !== 404) throw new Error(`Playlist remove failed (${response.status})`);
  }
}

export async function processPlaylistCommandQueue() {
  if (processing) return;
  processing = true;
  try {
    while (true) {
      const queue = readQueue();
      const command = queue.commands.find((item) => item.status === 'pending' && item.nextAttemptAt <= Date.now());
      if (!command) return;
      command.status = 'processing';
      writeQueue(queue);
      try {
        await executeCommand(command);
        const latest = readQueue();
        writeQueue({ commands: latest.commands.filter((item) => item.id !== command.id) });
      } catch (error) {
        const latest = readQueue();
        const failed = latest.commands.find((item) => item.id === command.id);
        if (failed) {
          failed.status = 'pending';
          failed.attempts += 1;
          failed.nextAttemptAt = Date.now() + Math.min(15 * 60_000, 2 ** Math.min(failed.attempts, 8) * 1000);
          writeQueue(latest);
        }
        console.error(`[playlist queue] command ${command.id} deferred:`, error);
        return;
      }
    }
  } finally {
    processing = false;
  }
}

export function getPlaylistCommandQueueStatus() {
  const commands = readQueue().commands;
  return {
    pending: commands.filter((command) => command.status === 'pending').length,
    processing: commands.filter((command) => command.status === 'processing').length,
  };
}

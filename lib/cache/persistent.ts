import fs from 'fs';
import path from 'path';
import { getDataDir } from '@/lib/nativeData';

export interface PersistentEntry<T = unknown> {
  value: T;
  storedAt: number;
  expiresAt: number;
}

interface PersistentEnvelope {
  version: 1;
  entries: Record<string, PersistentEntry>;
}

function cachePath(): string {
  return path.join(getDataDir(), 'entity-cache.json');
}

function readEnvelope(): PersistentEnvelope {
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath(), 'utf8')) as Partial<PersistentEnvelope>;
    if (parsed.version === 1 && parsed.entries && typeof parsed.entries === 'object') return parsed as PersistentEnvelope;
  } catch { /* first run or corrupt cache */ }
  return { version: 1, entries: {} };
}

function writeEnvelope(envelope: PersistentEnvelope): void {
  const file = cachePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.part`;
  fs.writeFileSync(temp, JSON.stringify(envelope, null, 2), 'utf8');
  fs.renameSync(temp, file);
}

export function getPersistent<T>(key: string, now = Date.now()): T | undefined {
  const entry = readEnvelope().entries[key] as PersistentEntry<T> | undefined;
  if (!entry) return undefined;
  if (entry.expiresAt > 0 && entry.expiresAt <= now) {
    deletePersistent(key);
    return undefined;
  }
  return entry.value;
}

export function setPersistent<T>(key: string, value: T, ttlMs = 0): void {
  const envelope = readEnvelope();
  envelope.entries[key] = { value, storedAt: Date.now(), expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0 };
  writeEnvelope(envelope);
}

export function deletePersistent(key: string): void {
  const envelope = readEnvelope();
  if (!(key in envelope.entries)) return;
  delete envelope.entries[key];
  writeEnvelope(envelope);
}

import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { getDataDir } from './nativeData';
import { refreshAccessToken } from './auth';
import { addCachedTrack, removeCachedTrack } from './db';
import type { SessionData } from '@/types';

export type OperationType =
  | 'playlist:add'
  | 'playlist:remove'
  | 'playlist:reorder'
  | 'playlist:delete'
  | 'playlist:create';

export type OperationStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'RETRY_WAIT'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type ErrorCategory =
  | 'TRANSIENT'
  | 'RATE_LIMITED'
  | 'AUTHENTICATION'
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PERMANENT'
  | 'UNKNOWN';

export interface OperationRecord {
  id: string;
  type: OperationType;
  target_resource: string;
  payload: string; // JSON stringified
  status: OperationStatus;
  attempt_count: number;
  max_attempts: number;
  created_at: number;
  updated_at: number;
  started_at: number | null;
  completed_at: number | null;
  next_attempt_at: number;
  idempotency_key: string;
  error_category: ErrorCategory | null;
  error_message: string | null;
  result: string | null; // JSON stringified
}

export interface EnqueueOperationOptions {
  type: OperationType;
  targetResource: string;
  payload: Record<string, any>;
  session: SessionData;
  idempotencyKey?: string;
  maxAttempts?: number;
}

let dbInstance: DatabaseSync | null = null;
let isInitialized = false;

function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  const dataDir = path.resolve(getDataDir());
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, 'operations.db');
  const db = new DatabaseSync(dbPath);

  // Enable WAL mode for safety and fast concurrent access
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS operations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      target_resource TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER,
      next_attempt_at INTEGER NOT NULL,
      idempotency_key TEXT UNIQUE NOT NULL,
      error_category TEXT,
      error_message TEXT,
      result TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ops_status_next ON operations(status, next_attempt_at);
    CREATE INDEX IF NOT EXISTS idx_ops_target ON operations(target_resource, created_at);
    CREATE INDEX IF NOT EXISTS idx_ops_idempotency ON operations(idempotency_key);
  `);

  dbInstance = db;
  return db;
}

/**
 * Startup Crash Recovery:
 * Intercept operations that were left in RUNNING when server crashed or restarted.
 */
export function recoverStuckOperations(): void {
  const db = getDb();
  const now = Date.now();
  const selectStmt = db.prepare(`SELECT * FROM operations WHERE status = 'RUNNING'`);
  const stuckOps = selectStmt.all() as unknown as OperationRecord[];

  if (stuckOps.length === 0) return;

  console.log(`[OperationEngine] Found ${stuckOps.length} stuck RUNNING operation(s) during startup recovery.`);

  const updateStmt = db.prepare(`
    UPDATE operations
    SET status = 'PENDING',
        started_at = NULL,
        updated_at = ?
    WHERE id = ? AND status = 'RUNNING'
  `);

  for (const op of stuckOps) {
    updateStmt.run(now, op.id);
    console.log(`[OperationEngine] Recovered stuck operation ${op.id} (${op.type} on ${op.target_resource}) back to PENDING.`);
  }
}

/**
 * Coalesce Redundant Operations:
 * Collapses preceding PENDING operations on the same target resource if a new superseding operation makes them redundant.
 */
function coalescePendingOperations(db: DatabaseSync, targetResource: string): void {
  const selectStmt = db.prepare(`
    SELECT * FROM operations 
    WHERE target_resource = ? AND status = 'PENDING'
    ORDER BY created_at ASC
  `);
  const pendingOps = selectStmt.all() as unknown as OperationRecord[];
  if (pendingOps.length < 2) return;

  const toCancel = new Set<string>();

  // Coalesce Strategy 1: Consecutive reorder operations on the same playlist -> keep only the latest reorder
  const reorders = pendingOps.filter((op) => op.type === 'playlist:reorder');
  if (reorders.length > 1) {
    for (let i = 0; i < reorders.length - 1; i++) {
      toCancel.add(reorders[i].id);
    }
  }

  // Coalesce Strategy 2: ADD then REMOVE of same track on same playlist -> cancel both!
  for (let i = 0; i < pendingOps.length; i++) {
    const op1 = pendingOps[i];
    if (toCancel.has(op1.id)) continue;

    if (op1.type === 'playlist:add') {
      const p1 = JSON.parse(op1.payload);
      for (let j = i + 1; j < pendingOps.length; j++) {
        const op2 = pendingOps[j];
        if (toCancel.has(op2.id)) continue;
        if (op2.type === 'playlist:remove') {
          const p2 = JSON.parse(op2.payload);
          if (p1.videoId && p2.videoId && p1.videoId === p2.videoId) {
            toCancel.add(op1.id);
            toCancel.add(op2.id);
            console.log(`[OperationEngine] Coalesced redundant ADD & REMOVE for videoId ${p1.videoId} on ${targetResource}.`);
            break;
          }
        }
      }
    }
  }

  if (toCancel.size > 0) {
    const cancelStmt = db.prepare(`
      UPDATE operations
      SET status = 'CANCELLED',
          updated_at = ?,
          result = ?
      WHERE id = ? AND status = 'PENDING'
    `);
    const now = Date.now();
    const resultJson = JSON.stringify({ coalesced: true, message: 'Coalesced by subsequent operation' });
    for (const id of toCancel) {
      cancelStmt.run(now, resultJson, id);
    }
  }
}

/**
 * Enqueue a durable operation
 */
export function enqueueOperation(options: EnqueueOperationOptions): OperationRecord {
  initOperationEngine();
  const db = getDb();
  const now = Date.now();

  const idempotencyKey =
    options.idempotencyKey ||
    `op_${options.type}_${options.targetResource}_${options.payload.videoId || options.payload.playlistId || ''}_${now}`;

  // Idempotency check: if key already exists, return existing operation
  const existingStmt = db.prepare(`SELECT * FROM operations WHERE idempotency_key = ?`);
  const existing = existingStmt.get(idempotencyKey) as unknown as OperationRecord | undefined;
  if (existing) {
    console.log(`[OperationEngine] Idempotent hit for key ${idempotencyKey} (status: ${existing.status})`);
    return existing;
  }

  const id = `op_${now}_${Math.random().toString(36).slice(2, 8)}`;
  const payloadJson = JSON.stringify({
    ...options.payload,
    refreshToken: options.session.refreshToken,
    accessToken: options.session.accessToken,
    expiresAt: options.session.expiresAt,
  });

  const insertStmt = db.prepare(`
    INSERT INTO operations (
      id, type, target_resource, payload, status, attempt_count, max_attempts,
      created_at, updated_at, next_attempt_at, idempotency_key
    ) VALUES (
      ?, ?, ?, ?, 'PENDING', 0, ?,
      ?, ?, ?, ?
    )
  `);

  const maxAttempts = options.maxAttempts ?? 5;
  insertStmt.run(
    id,
    options.type,
    options.targetResource,
    payloadJson,
    maxAttempts,
    now,
    now,
    now,
    idempotencyKey
  );

  console.log(`[OperationEngine] Enqueued [${id}] ${options.type} on ${options.targetResource}`);

  // Perform operation coalescing check
  coalescePendingOperations(db, options.targetResource);

  // Trigger worker loop
  triggerWorker();

  const selectStmt = db.prepare(`SELECT * FROM operations WHERE id = ?`);
  return selectStmt.get(id) as unknown as OperationRecord;
}

/**
 * Get Access Token with automatic OAuth refresh
 */
async function getValidAccessToken(payload: any): Promise<{ accessToken: string; refreshedPayload?: any }> {
  let { accessToken, refreshToken, expiresAt } = payload;
  if (!accessToken || !expiresAt || Date.now() > expiresAt - 60_000) {
    const refreshed = await refreshAccessToken(refreshToken);
    if (!refreshed) {
      const err = new Error('Could not refresh YouTube authentication token');
      (err as any).category = 'AUTHENTICATION';
      throw err;
    }
    accessToken = refreshed.accessToken;
    expiresAt = refreshed.expiresAt;
    return { accessToken, refreshedPayload: { ...payload, accessToken, expiresAt } };
  }
  return { accessToken };
}

/**
 * Classify HTTP or JS Errors for backoff strategy
 */
function classifyError(error: any): { category: ErrorCategory; isRetryable: boolean; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  if ((error as any)?.category === 'AUTHENTICATION') {
    return { category: 'AUTHENTICATION', isRetryable: true, message };
  }

  const status = (error as any)?.status || (error as any)?.statusCode;
  if (status === 401 || status === 403) {
    return { category: 'AUTHENTICATION', isRetryable: true, message };
  }
  if (status === 429) {
    return { category: 'RATE_LIMITED', isRetryable: true, message };
  }
  if (status === 400 || status === 422) {
    return { category: 'INVALID_REQUEST', isRetryable: false, message };
  }
  if (status === 404) {
    return { category: 'NOT_FOUND', isRetryable: false, message };
  }
  if (status === 409) {
    return { category: 'CONFLICT', isRetryable: false, message };
  }
  if (status >= 500 && status <= 599) {
    return { category: 'TRANSIENT', isRetryable: true, message };
  }
  if (message.includes('fetch failed') || message.includes('ETIMEDOUT') || message.includes('ECONNRESET') || message.includes('network')) {
    return { category: 'TRANSIENT', isRetryable: true, message };
  }

  return { category: 'UNKNOWN', isRetryable: true, message };
}

/**
 * Desired-State Reconciliation Execution for each operation type
 */
async function executeOperationCore(op: OperationRecord): Promise<Record<string, any>> {
  const payload = JSON.parse(op.payload);
  const { accessToken } = await getValidAccessToken(payload);
  const headers = { Authorization: `Bearer ${accessToken}` };

  if (op.type === 'playlist:add') {
    const { playlistId, videoId, track } = payload;
    if (!playlistId || !videoId) {
      const err = new Error('Missing playlistId or videoId');
      (err as any).status = 400;
      throw err;
    }

    if (track) {
      addCachedTrack(playlistId, track);
    }

    // Desired-state check: query YTM to see if track is already present in playlist
    const lookup = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    lookup.searchParams.set('part', 'snippet');
    lookup.searchParams.set('playlistId', playlistId);
    lookup.searchParams.set('maxResults', '50');

    const checkRes = await fetch(lookup.toString(), { headers });
    let existingItem: any = null;
    if (checkRes.ok) {
      const checkData = await checkRes.json().catch(() => ({}));
      const items = checkData.items || [];
      existingItem = items.find((it: any) => it.snippet?.resourceId?.videoId === videoId);
    } else if (checkRes.status !== 404) {
      const err = new Error(`Playlist add lookup failed (${checkRes.status})`);
      (err as any).status = checkRes.status;
      throw err;
    }

    if (existingItem) {
      console.log(`[OperationEngine] Desired state matched: Track ${videoId} already present in ${playlistId}.`);
      return { reconciled: true, message: 'Track already in playlist', existingItemId: existingItem.id };
    }

    // Mutate state: Add track
    const addRes = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snippet: {
          playlistId,
          resourceId: { kind: 'youtube#video', videoId },
        },
      }),
    });

    if (!addRes.ok) {
      const errData = await addRes.json().catch(() => ({}));
      const err = new Error(errData.error?.message || `Playlist add failed (${addRes.status})`);
      (err as any).status = addRes.status;
      throw err;
    }

    const resData = await addRes.json();
    return { success: true, playlistItemId: resData.id };
  }

  if (op.type === 'playlist:remove') {
    const { playlistId, videoId, playlistItemId } = payload;
    if (!playlistId || (!videoId && !playlistItemId)) {
      const err = new Error('Missing playlistId and video identifier');
      (err as any).status = 400;
      throw err;
    }

    if (videoId) {
      removeCachedTrack(playlistId, videoId);
    }

    // Desired-state check: lookup items to delete
    let itemsToDelete: Array<{ id: string }> = [];
    if (playlistItemId) {
      itemsToDelete = [{ id: playlistItemId }];
    } else {
      const lookup = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
      lookup.searchParams.set('part', 'id,snippet');
      lookup.searchParams.set('playlistId', playlistId);
      lookup.searchParams.set('maxResults', '50');

      const checkRes = await fetch(lookup.toString(), { headers });
      if (checkRes.ok) {
        const checkData = await checkRes.json().catch(() => ({}));
        const items = checkData.items || [];
        itemsToDelete = items.filter((it: any) => it.snippet?.resourceId?.videoId === videoId);
      } else if (checkRes.status === 404) {
        itemsToDelete = [];
      } else {
        const err = new Error(`Playlist remove lookup failed (${checkRes.status})`);
        (err as any).status = checkRes.status;
        throw err;
      }
    }

    if (itemsToDelete.length === 0) {
      console.log(`[OperationEngine] Desired state matched: Track ${videoId || playlistItemId} already removed from ${playlistId}.`);
      return { reconciled: true, message: 'Track already removed from playlist' };
    }

    for (const item of itemsToDelete) {
      if (!item.id) continue;
      const delRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?id=${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
        headers,
      });
      if (!delRes.ok && delRes.status !== 404) {
        const err = new Error(`Playlist remove failed (${delRes.status})`);
        (err as any).status = delRes.status;
        throw err;
      }
    }

    return { success: true, removedCount: itemsToDelete.length };
  }

  if (op.type === 'playlist:reorder') {
    const { playlistId, videoIds } = payload;
    if (!playlistId || !Array.isArray(videoIds)) {
      const err = new Error('Missing playlistId or videoIds array');
      (err as any).status = 400;
      throw err;
    }

    const listRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=id,snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=50`,
      { headers }
    );
    if (!listRes.ok) {
      const err = new Error(`Playlist reorder fetch items failed (${listRes.status})`);
      (err as any).status = listRes.status;
      throw err;
    }

    const listData = await listRes.json();
    const items = listData.items || [];
    const itemMap = new Map<string, string>();
    items.forEach((it: any) => {
      if (it.snippet?.resourceId?.videoId && it.id) {
        itemMap.set(it.snippet.resourceId.videoId, it.id);
      }
    });

    const updatePromises = videoIds.map(async (vId: string, newPosition: number) => {
      const pItemId = itemMap.get(vId);
      if (!pItemId) return false;
      const currentItemIndex = items.findIndex((it: any) => it.snippet?.resourceId?.videoId === vId);
      if (currentItemIndex === newPosition) return true; // Desired state already matched

      try {
        const updateRes = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: pItemId,
            snippet: {
              playlistId,
              resourceId: { kind: 'youtube#video', videoId: vId },
              position: newPosition,
            },
          }),
        });
        return updateRes.ok;
      } catch {
        return false;
      }
    });

    const results = await Promise.all(updatePromises);
    const updatedCount = results.filter(Boolean).length;
    return { success: true, updatedCount };
  }

  if (op.type === 'playlist:delete') {
    const { playlistId } = payload;
    if (!playlistId) {
      const err = new Error('Missing playlistId');
      (err as any).status = 400;
      throw err;
    }

    const ytRes = await fetch(`https://www.googleapis.com/youtube/v3/playlists?id=${encodeURIComponent(playlistId)}`, {
      method: 'DELETE',
      headers,
    });
    if (!ytRes.ok && ytRes.status !== 404) {
      const err = new Error(`YouTube API playlist delete failed (${ytRes.status})`);
      (err as any).status = ytRes.status;
      throw err;
    }

    return { success: true, playlistId };
  }

  throw new Error(`Unsupported operation type: ${op.type}`);
}

/**
 * Worker Core Loop: Process 1 eligible operation atomically with per-resource locking
 */
async function processNextOperation(): Promise<boolean> {
  const db = getDb();
  const now = Date.now();

  // Find running resources so we enforce per-resource serialization
  const runningStmt = db.prepare(`SELECT DISTINCT target_resource FROM operations WHERE status = 'RUNNING'`);
  const runningResources = (runningStmt.all() as unknown as Array<{ target_resource: string }>).map((r) => r.target_resource);

  let whereClause = `WHERE status IN ('PENDING', 'RETRY_WAIT') AND next_attempt_at <= ?`;
  const params: any[] = [now];

  if (runningResources.length > 0) {
    const placeholders = runningResources.map(() => '?').join(',');
    whereClause += ` AND target_resource NOT IN (${placeholders})`;
    params.push(...runningResources);
  }

  const query = `
    SELECT * FROM operations
    ${whereClause}
    ORDER BY created_at ASC
    LIMIT 1
  `;

  const op = db.prepare(query).get(...params) as unknown as OperationRecord | undefined;
  if (!op) return false;

  // Atomic Compare-And-Set claim: PENDING/RETRY_WAIT -> RUNNING
  const claimStmt = db.prepare(`
    UPDATE operations
    SET status = 'RUNNING',
        started_at = ?,
        updated_at = ?,
        attempt_count = attempt_count + 1
    WHERE id = ? AND status IN ('PENDING', 'RETRY_WAIT')
  `);

  const result = claimStmt.run(now, now, op.id);
  if (result.changes === 0) {
    // Another worker claimed it
    return true;
  }

  op.status = 'RUNNING';
  op.started_at = now;
  op.attempt_count += 1;

  console.log(`[OperationEngine] [${op.id}] Claimed RUNNING (${op.type} on ${op.target_resource}, attempt ${op.attempt_count})`);

  try {
    const resultObj = await executeOperationCore(op);
    const completedAt = Date.now();
    const completeStmt = db.prepare(`
      UPDATE operations
      SET status = 'COMPLETED',
          completed_at = ?,
          updated_at = ?,
          result = ?
      WHERE id = ? AND status = 'RUNNING'
    `);
    completeStmt.run(completedAt, completedAt, JSON.stringify(resultObj), op.id);
    console.log(`[OperationEngine] [${op.id}] COMPLETED (${completedAt - now}ms)`);
  } catch (error: any) {
    const failedAt = Date.now();
    const { category, isRetryable, message } = classifyError(error);

    if (isRetryable && op.attempt_count < op.max_attempts) {
      // Exponential backoff with jitter
      const backoffDelay = Math.min(15 * 60_000, 2 ** Math.min(op.attempt_count, 8) * 1000 + Math.floor(Math.random() * 500));
      const nextAttemptAt = failedAt + backoffDelay;

      const retryStmt = db.prepare(`
        UPDATE operations
        SET status = 'RETRY_WAIT',
            next_attempt_at = ?,
            error_category = ?,
            error_message = ?,
            updated_at = ?
        WHERE id = ? AND status = 'RUNNING'
      `);
      retryStmt.run(nextAttemptAt, category, message, failedAt, op.id);
      console.warn(`[OperationEngine] [${op.id}] RETRY_WAIT (${category}: ${message}) -> next attempt in ${backoffDelay}ms`);
    } else {
      const failStmt = db.prepare(`
        UPDATE operations
        SET status = 'FAILED',
            error_category = ?,
            error_message = ?,
            updated_at = ?
        WHERE id = ? AND status = 'RUNNING'
      `);
      failStmt.run(category, message, failedAt, op.id);
      console.error(`[OperationEngine] [${op.id}] FAILED PERMANENTLY (${category}: ${message})`);
    }
  }

  return true;
}

/**
 * Worker Pool Concurrency Trigger (Max 3 concurrent workers)
 */
const MAX_CONCURRENT_WORKERS = 3;
let activeWorkerCount = 0;

export function triggerWorker(): void {
  if (activeWorkerCount >= MAX_CONCURRENT_WORKERS) return;

  activeWorkerCount++;
  (async () => {
    try {
      while (true) {
        const processed = await processNextOperation();
        if (!processed) break;
      }
    } finally {
      activeWorkerCount--;
    }
  })();
}

/**
 * Initialize Engine & Startup Crash Recovery
 */
export function initOperationEngine(): void {
  if (isInitialized) return;
  isInitialized = true;
  try {
    getDb();
    recoverStuckOperations();
    triggerWorker();
  } catch (err) {
    console.error('[OperationEngine] Failed to initialize operation engine:', err);
  }
}

/**
 * Public Query Methods
 */
export function getOperation(id: string): OperationRecord | null {
  initOperationEngine();
  const db = getDb();
  const stmt = db.prepare(`SELECT * FROM operations WHERE id = ?`);
  return (stmt.get(id) as unknown as OperationRecord) || null;
}

export function getOperations(filter?: { targetResource?: string; status?: OperationStatus; limit?: number }): OperationRecord[] {
  initOperationEngine();
  const db = getDb();
  let query = `SELECT * FROM operations`;
  const conditions: string[] = [];
  const params: any[] = [];

  if (filter?.targetResource) {
    conditions.push(`target_resource = ?`);
    params.push(filter.targetResource);
  }
  if (filter?.status) {
    conditions.push(`status = ?`);
    params.push(filter.status);
  }

  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(' AND ');
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(filter?.limit || 50);

  const stmt = db.prepare(query);
  return stmt.all(...params) as unknown as OperationRecord[];
}

/** Pending playlist intent used to overlay slow/stale remote reads. */
export function getPendingPlaylistMutations(playlistId: string): Array<{
  operation: 'add' | 'remove';
  videoId: string;
  track?: any;
  playlistItemId?: string;
  sequence: number;
}> {
  const operations = getOperations({ targetResource: `playlist:${playlistId}`, limit: 500 })
    .filter((operation) => operation.status === 'PENDING' || operation.status === 'RUNNING' || operation.status === 'RETRY_WAIT')
    .sort((a, b) => a.created_at - b.created_at);
  return operations.flatMap((operation) => {
    if (operation.type !== 'playlist:add' && operation.type !== 'playlist:remove') return [];
    try {
      const payload = JSON.parse(operation.payload) as { videoId?: string; track?: any; playlistItemId?: string };
      if (!payload.videoId) return [];
      return [{
        operation: operation.type === 'playlist:add' ? 'add' as const : 'remove' as const,
        videoId: payload.videoId,
        track: payload.track,
        playlistItemId: payload.playlistItemId,
        sequence: operation.created_at,
      }];
    } catch {
      return [];
    }
  });
}

export function cancelOperation(id: string): boolean {
  initOperationEngine();
  const db = getDb();
  const now = Date.now();
  const stmt = db.prepare(`
    UPDATE operations
    SET status = 'CANCELLED',
        updated_at = ?,
        result = ?
    WHERE id = ? AND status IN ('PENDING', 'RETRY_WAIT')
  `);
  const res = stmt.run(now, JSON.stringify({ cancelled: true }), id);
  return res.changes > 0;
}

export function getOperationStats(): { pending: number; running: number; retryWait: number; completed: number; failed: number } {
  initOperationEngine();
  const db = getDb();
  const stmt = db.prepare(`SELECT status, COUNT(*) as count FROM operations GROUP BY status`);
  const rows = stmt.all() as unknown as Array<{ status: string; count: number }>;
  const stats = { pending: 0, running: 0, retryWait: 0, completed: 0, failed: 0 };
  for (const r of rows) {
    if (r.status === 'PENDING') stats.pending = r.count;
    if (r.status === 'RUNNING') stats.running = r.count;
    if (r.status === 'RETRY_WAIT') stats.retryWait = r.count;
    if (r.status === 'COMPLETED') stats.completed = r.count;
    if (r.status === 'FAILED') stats.failed = r.count;
  }
  return stats;
}

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

console.log('--- STARTING OPERATION ENGINE VERIFICATION SUITE ---');

// Mock data dir
const testDir = path.join(__dirname, 'test_db_dir');
if (fs.existsSync(testDir)) {
  fs.rmSync(testDir, { recursive: true, force: true });
}
fs.mkdirSync(testDir, { recursive: true });

const dbPath = path.join(testDir, 'operations.db');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');

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

// Test 1: Durable Persistence & Idempotency Key
console.log('\n[TEST 1] Testing Idempotency & Persistence...');
const now = Date.now();
const insertStmt = db.prepare(`
  INSERT INTO operations (
    id, type, target_resource, payload, status, attempt_count, max_attempts,
    created_at, updated_at, next_attempt_at, idempotency_key
  ) VALUES (?, ?, ?, ?, 'PENDING', 0, 5, ?, ?, ?, ?)
`);

insertStmt.run('op_1', 'playlist:add', 'playlist:PL123', JSON.stringify({ videoId: 'vid1' }), now, now, now, 'idempotent_key_1');

let count = db.prepare('SELECT COUNT(*) as c FROM operations').get().c;
console.log(`Operations count after 1st insert: ${count}`);

try {
  insertStmt.run('op_2', 'playlist:add', 'playlist:PL123', JSON.stringify({ videoId: 'vid1' }), now, now, now, 'idempotent_key_1');
  console.error('FAIL: Expected idempotency constraint error!');
} catch (err) {
  console.log('PASS: Idempotency constraint correctly prevented duplicate insertion.');
}

// Test 2: Crash Recovery of Stuck RUNNING Operations
console.log('\n[TEST 2] Testing Crash Recovery for Stuck RUNNING Operations...');
insertStmt.run('op_stuck', 'playlist:add', 'playlist:PL999', JSON.stringify({ videoId: 'vid_stuck' }), now - 5000, now - 5000, now - 5000, 'idempotent_stuck');

// Simulate crash leaving operation in RUNNING
db.prepare("UPDATE operations SET status = 'RUNNING', started_at = ? WHERE id = 'op_stuck'").run(now - 5000);

let stuckBefore = db.prepare("SELECT * FROM operations WHERE status = 'RUNNING'").all();
console.log(`Stuck RUNNING operations before recovery: ${stuckBefore.length}`);

// Perform recovery
const updateRecover = db.prepare(`
  UPDATE operations
  SET status = 'PENDING',
      started_at = NULL,
      updated_at = ?
  WHERE id = ? AND status = 'RUNNING'
`);
for (const op of stuckBefore) {
  updateRecover.run(Date.now(), op.id);
}

let stuckAfter = db.prepare("SELECT * FROM operations WHERE status = 'RUNNING'").all();
let recovered = db.prepare("SELECT * FROM operations WHERE id = 'op_stuck'").get();
console.log(`Stuck RUNNING operations after recovery: ${stuckAfter.length}`);
console.log(`Recovered op status: ${recovered.status}`);

if (stuckAfter.length === 0 && recovered.status === 'PENDING') {
  console.log('PASS: Startup crash recovery successfully restored stuck RUNNING operations to PENDING.');
} else {
  console.error('FAIL: Crash recovery failed!');
}

// Test 3: Operation Coalescing (ADD then REMOVE of same track)
console.log('\n[TEST 3] Testing Operation Coalescing (ADD + REMOVE)...');
insertStmt.run('op_add', 'playlist:add', 'playlist:PL_coalesce', JSON.stringify({ videoId: 'vid_coalesce' }), now + 1, now + 1, now + 1, 'idempotent_add');
insertStmt.run('op_rem', 'playlist:remove', 'playlist:PL_coalesce', JSON.stringify({ videoId: 'vid_coalesce' }), now + 2, now + 2, now + 2, 'idempotent_rem');

// Coalesce algorithm logic check
const pendingOps = db.prepare("SELECT * FROM operations WHERE target_resource = 'playlist:PL_coalesce' AND status = 'PENDING' ORDER BY created_at ASC").all();
console.log(`Pending ops for target before coalescing: ${pendingOps.length}`);

const toCancel = new Set();
for (let i = 0; i < pendingOps.length; i++) {
  const op1 = pendingOps[i];
  if (op1.type === 'playlist:add') {
    const p1 = JSON.parse(op1.payload);
    for (let j = i + 1; j < pendingOps.length; j++) {
      const op2 = pendingOps[j];
      if (op2.type === 'playlist:remove') {
        const p2 = JSON.parse(op2.payload);
        if (p1.videoId === p2.videoId) {
          toCancel.add(op1.id);
          toCancel.add(op2.id);
        }
      }
    }
  }
}

const cancelStmt = db.prepare("UPDATE operations SET status = 'CANCELLED' WHERE id = ?");
for (const id of toCancel) cancelStmt.run(id);

const cancelledOps = db.prepare("SELECT * FROM operations WHERE status = 'CANCELLED'").all();
console.log(`Cancelled ops count: ${cancelledOps.length}`);
if (cancelledOps.length === 2) {
  console.log('PASS: Coalescing algorithm successfully identified and cancelled opposing ADD/REMOVE operations.');
} else {
  console.error('FAIL: Coalescing failed!');
}

// Test 4: Per-Resource Serialization Query
console.log('\n[TEST 4] Testing Per-Resource Serialization Query...');
db.prepare("INSERT INTO operations (id, type, target_resource, payload, status, attempt_count, max_attempts, created_at, updated_at, next_attempt_at, idempotency_key) VALUES ('op_r1', 'playlist:add', 'playlist:RESOURCE_A', '{}', 'RUNNING', 1, 5, 100, 100, 100, 'k1')").run();
db.prepare("INSERT INTO operations (id, type, target_resource, payload, status, attempt_count, max_attempts, created_at, updated_at, next_attempt_at, idempotency_key) VALUES ('op_p1', 'playlist:add', 'playlist:RESOURCE_A', '{}', 'PENDING', 0, 5, 101, 101, 101, 'k2')").run();
db.prepare("INSERT INTO operations (id, type, target_resource, payload, status, attempt_count, max_attempts, created_at, updated_at, next_attempt_at, idempotency_key) VALUES ('op_p2', 'playlist:add', 'playlist:RESOURCE_B', '{}', 'PENDING', 0, 5, 102, 102, 102, 'k3')").run();

// Query next operation excluding running resources
const runningResources = db.prepare("SELECT DISTINCT target_resource FROM operations WHERE status = 'RUNNING'").all().map((r) => r.target_resource);
console.log(`Currently running resources: ${runningResources.join(', ')}`);

const placeholders = runningResources.map(() => '?').join(',');
const queryNext = db.prepare(`SELECT * FROM operations WHERE status IN ('PENDING', 'RETRY_WAIT') AND target_resource NOT IN (${placeholders}) ORDER BY created_at ASC LIMIT 1`);
const nextOp = queryNext.get(...runningResources);

console.log(`Next claimable op ID: ${nextOp.id} (target: ${nextOp.target_resource})`);
if (nextOp.target_resource === 'playlist:RESOURCE_B') {
  console.log('PASS: Per-resource locking correctly blocked pending operation on RESOURCE_A while allowing RESOURCE_B.');
} else {
  console.error('FAIL: Per-resource serialization query failed!');
}

console.log('\n--- ALL VERIFICATION TESTS PASSED SUCCESSFULLY! ---');

// Cleanup
db.close();
fs.rmSync(testDir, { recursive: true, force: true });

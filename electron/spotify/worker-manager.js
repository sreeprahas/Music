const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_QUEUE = 100;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESTARTS = 5;

class SpotApiWorkerManager extends EventEmitter {
  constructor({ app, logger = console, env = {} } = {}) {
    super();
    this.app = app;
    this.logger = logger;
    this.env = env;
    this.child = null;
    this.status = 'stopped';
    this.buffer = '';
    this.queue = [];
    this.pending = new Map();
    this.restartTimer = null;
    this.startPromise = null;
    this.stopping = false;
    this.restartCount = 0;
  }

  getStatus() { return this.status; }

  async start() {
    if (this.status === 'ready' || this.status === 'starting' || this.status === 'restarting') return this.startPromise;
    this.stopping = false;
    this.restartCount = 0;
    this.startPromise = this._launch();
    return this.startPromise;
  }

  request(method, params = {}) {
    if (this.stopping || this.status === 'stopped') return Promise.reject(this._error('WORKER_STOPPED', 'Spotify worker is stopped.'));
    if (this.status === 'error' && !this.child && this.restartCount < MAX_RESTARTS) {
      this.startPromise = this._launch();
    }
    if (this.queue.length >= MAX_QUEUE && this.status !== 'ready') return Promise.reject(this._error('WORKER_BUSY', 'Spotify worker request queue is full.'));
    return new Promise((resolve, reject) => {
      const item = { method, params, resolve, reject };
      if (this.status === 'ready') this._write(item);
      else this.queue.push(item);
    });
  }

  async stop() {
    this.stopping = true;
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
    for (const item of this.queue.splice(0)) item.reject(this._error('WORKER_STOPPED', 'Spotify worker stopped.'));
    for (const [id, item] of this.pending) { clearTimeout(item.timer); item.reject(this._error('WORKER_STOPPED', 'Spotify worker stopped.')); this.pending.delete(id); }
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null) { this._setStatus('stopped'); return; }
    await new Promise((resolve) => {
      let finished = false;
      const done = () => { if (!finished) { finished = true; resolve(); } };
      child.once('exit', done);
      try { child.stdin.write(`${JSON.stringify({ id: crypto.randomUUID(), method: 'shutdown', params: {}})}\n`); } catch { /* process is already exiting */ }
      try { child.stdin.end(); } catch { /* ignore */ }
      setTimeout(() => { if (!finished) { try { child.kill(); } catch { /* ignore */ } done(); } }, 1500);
    });
    this._setStatus('stopped');
  }

  async _launch() {
    this._setStatus(this.restartCount ? 'restarting' : 'starting');
    const executable = this._findPython();
    if (!executable) {
      this._setStatus('error');
      this.logger.error('[spotify-worker] Python runtime not found. Set SPOTAPI_PYTHON or install Python.');
      return;
    }
    const args = executable.args.concat([this._workerPath()]);
    try {
      const child = spawn(executable.command, args, {
        cwd: path.dirname(this._workerPath()),
        env: { ...process.env, ...this.env, PYTHONUNBUFFERED: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      this.child = child;
      this.buffer = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => this._onStdout(chunk));
      child.stderr.on('data', (chunk) => this.logger.warn('[spotify-worker]', String(chunk).trim()));
      child.once('error', (error) => this._onCrash(error));
      child.once('exit', (code, signal) => this._onExit(code, signal));
    } catch (error) {
      this._onCrash(error);
    }
  }

  _onStdout(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed === 'READY') { this.restartCount = 0; this._setStatus('ready'); this._flush(); continue; }
      try { this._onMessage(JSON.parse(trimmed)); }
      catch { this.logger.warn('[spotify-worker] Ignoring malformed protocol output.'); }
    }
  }

  _onMessage(message) {
    if (!message || typeof message.id !== 'string') return;
    const item = this.pending.get(message.id);
    if (!item) return;
    this.pending.delete(message.id);
    clearTimeout(item.timer);
    if (message.success) item.resolve(message.result);
    else item.reject(this._error(message.error?.code || 'SPOTIFY_ERROR', message.error?.message || 'Spotify worker request failed.'));
  }

  _flush() { while (this.status === 'ready' && this.queue.length) this._write(this.queue.shift()); }

  _write(item) {
    if (!this.child || this.status !== 'ready') { this.queue.unshift(item); return; }
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      if (!this.pending.has(id)) return;
      this.pending.delete(id);
      item.reject(this._error('WORKER_TIMEOUT', 'Spotify worker request timed out.'));
    }, REQUEST_TIMEOUT_MS);
    this.pending.set(id, { resolve: item.resolve, reject: item.reject, timer });
    try { this.child.stdin.write(`${JSON.stringify({ id, method: item.method, params: item.params })}\n`); }
    catch (error) { clearTimeout(timer); this.pending.delete(id); item.reject(error); }
  }

  _onCrash(error) {
    if (this.stopping) return;
    this.logger.error('[spotify-worker] Worker failure:', error?.message || error);
    this._setStatus('error');
  }

  _onExit(code, signal) {
    if (this.stopping) return;
    this.child = null;
    for (const [id, item] of this.pending) { clearTimeout(item.timer); item.reject(this._error('WORKER_CRASHED', 'Spotify worker stopped unexpectedly.')); this.pending.delete(id); }
    this._setStatus('error');
    if (this.restartCount >= MAX_RESTARTS) { this.logger.error('[spotify-worker] Restart limit reached.'); return; }
    const delay = Math.min(10_000, 500 * (2 ** this.restartCount));
    this.restartCount += 1;
    this._setStatus('restarting');
    this.restartTimer = setTimeout(() => { this.restartTimer = null; this.startPromise = this._launch(); }, delay);
    this.logger.warn(`[spotify-worker] Worker exited (code=${code}, signal=${signal}); restarting in ${delay}ms.`);
  }

  _setStatus(status) { this.status = status; this.emit('status', status); }

  _workerPath() {
    const candidates = [
      process.env.SPOTAPI_WORKER_PATH,
      path.join(process.resourcesPath || '', 'spotapi', 'worker.py'),
      path.join(__dirname, 'providers', 'spotapi', 'worker.py'),
    ].filter(Boolean);
    const found = candidates.find((candidate) => fs.existsSync(candidate));
    return found || candidates[candidates.length - 1];
  }

  _findPython() {
    const candidates = [
      process.env.SPOTAPI_PYTHON,
      path.join(process.cwd(), '.venv', 'Scripts', 'python.exe'),
      path.join(process.resourcesPath || '', 'spotapi-runtime', 'python.exe'),
      path.join(__dirname, 'runtime', 'python.exe'),
    ].filter(Boolean);
    const command = candidates.find((candidate) => path.isAbsolute(candidate) ? fs.existsSync(candidate) : true);
    if (command) return { command, args: [] };
    return process.platform === 'win32' ? { command: 'py.exe', args: ['-3'] } : { command: 'python3', args: [] };
  }

  _error(code, message) { const error = new Error(message); error.code = code; return error; }
}

module.exports = { SpotApiWorkerManager };

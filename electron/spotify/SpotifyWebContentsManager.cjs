'use strict';

const { BrowserWindow } = require('electron');

/**
 * Owns the single hidden Spotify renderer. All scraping work is serialized so
 * Spotify sees one browser-like session and imports cannot create window storms.
 */
class SpotifyWebContentsManager {
  constructor(options = {}) {
    // This renderer is disposable. Keep Spotify cookies/cache out of the
    // normal persistent browser profile and release the session with the
    // BrowserWindow after each import/sync.
    this.partition = options.partition || 'in-memory:music-spotify-scraper';
    this.window = null;
    this.creationPromise = null;
    this.tail = Promise.resolve();
  }

  async getWindow() {
    if (this.window && !this.window.isDestroyed()) return this.window;
    if (this.creationPromise) return this.creationPromise;

    this.creationPromise = (async () => {
      const win = new BrowserWindow({
        show: false,
        focusable: false,
        skipTaskbar: true,
        width: 1280,
        height: 900,
        backgroundColor: '#121212',
        title: 'Music Spotify provider',
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          backgroundThrottling: true,
          partition: this.partition,
        },
      });

      win.setMenuBarVisibility(false);
      const contents = win.webContents;
      contents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
      contents.setAudioMuted(true);
      contents.on('console-message', (event) => {
        const { level, message, line, sourceId } = event;
        console.log(`[renderer-console-${level}] ${message} (${sourceId}:${line})`);
      });
      contents.on('render-process-gone', (_event, details) => {
        console.error('[spotify-provider] Renderer gone:', details?.reason || details);
        this.destroy();
      });
      contents.on('did-fail-load', (_event, code, description, validatedURL, isMainFrame) => {
        // Sub-frame failures are common; navigation errors are surfaced by scrape().
        if (!isMainFrame) return;
        console.warn('[spotify-provider] Main load failed:', code, description);
      });

      this.window = win;
      return win;
    })();

    try {
      return await this.creationPromise;
    } finally {
      this.creationPromise = null;
    }
  }

  /** Run one scrape at a time while retaining one reusable WebContents. */
  runExclusive(task) {
    const next = this.tail.then(task, task);
    this.tail = next.catch(() => {});
    return next;
  }

  destroy() {
    const win = this.window;
    this.window = null;
    this.creationPromise = null;
    if (win && !win.isDestroyed()) {
      try { win.webContents.stop(); } catch {}
      win.destroy();
    }
  }
}

module.exports = { SpotifyWebContentsManager };

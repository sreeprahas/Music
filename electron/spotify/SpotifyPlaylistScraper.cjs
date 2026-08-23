'use strict';

const { SpotifyWebContentsManager } = require('./SpotifyWebContentsManager.cjs');

const DEFAULT_TIMEOUT_MS = Number(process.env.SPOTIFY_SCRAPER_TIMEOUT_MS || 10 * 60 * 1000);
const PAGE_WAIT_MS = 45_000;
const SCROLL_WAIT_MS = 15_000;

class SpotifyScrapeError extends Error {
  constructor(message, code = 'spotify-scrape-failed') {
    super(message);
    this.name = 'SpotifyScrapeError';
    this.code = code;
  }
}

function normalizePlaylistTarget(input) {
  const raw = String(input || '').trim();
  let id = raw;
  const uriMatch = /^spotify:playlist:([A-Za-z0-9]+)$/.exec(raw);
  if (uriMatch) id = uriMatch[1];
  else {
    try {
      const url = new URL(raw);
      const match = /\/playlist\/([A-Za-z0-9]+)/.exec(url.pathname);
      if (match) id = match[1];
    } catch {}
  }
  if (!/^[A-Za-z0-9]{22}$/.test(id)) {
    throw new SpotifyScrapeError('A valid public Spotify playlist ID or URL is required.', 'invalid-playlist');
  }
  return { playlistId: id, url: `https://open.spotify.com/playlist/${id}` };
}

async function withDeadline(promise, ms, message, signal) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new SpotifyScrapeError(message, 'timeout')), ms);
      }),
      aborted(signal),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function aborted(signal) {
  if (!signal) return new Promise(() => {});
  if (signal.aborted) return Promise.reject(new SpotifyScrapeError('Spotify scrape was canceled.', 'canceled'));
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => {
      reject(new SpotifyScrapeError('Spotify scrape was canceled.', 'canceled'));
    }, { once: true });
  });
}

async function sleep(ms, signal) {
  await Promise.race([new Promise((resolve) => setTimeout(resolve, ms)), aborted(signal)]);
}

/** Extract complete embedded state first; DOM and accessibility labels are fallbacks. */
function extractionScript(mode) {
  const body = `(() => {
    function text(value) { return typeof value === 'string' ? value.trim() : ''; }
    function trackId(value) {
      if (typeof value !== 'string') return '';
      const uri = /^spotify:track:([A-Za-z0-9]{22})$/.exec(value);
      if (uri) return uri[1];
      return /^[A-Za-z0-9]{22}$/.test(value) ? value : '';
    }
    function artistsFrom(value) {
      if (value && typeof value === 'object' && Array.isArray(value.items)) {
        return artistsFrom(value.items);
      }
      if (Array.isArray(value) && value.some((artist) => artist?.profile?.name)) {
        return value.map((artist) => text(artist.profile?.name) || text(artist.name)).filter(Boolean).join(', ');
      }
      if (Array.isArray(value)) {
        return value.map((artist) => artist && typeof artist === 'object' ? text(artist.name) : text(artist))
          .filter(Boolean).join(', ');
      }
      if (value && typeof value === 'object' && value.profile?.name) return text(value.profile.name);
      return text(value && value.name);
    }
    function imageFrom(value) {
      if (!value || typeof value !== 'object') return '';
      const sources = value.coverArt?.sources || value.album?.images ||
        value.albumOfTrack?.coverArt?.sources || value.images;
      if (!Array.isArray(sources)) return typeof value.url === 'string' ? value.url : '';
      const best = [...sources].sort((a, b) => (b.width || b.maxWidth || 0) - (a.width || a.maxWidth || 0))[0];
      return text(best?.url);
    }
    function normalizeStructured(raw) {
      const item = raw && typeof raw === 'object' ? raw : {};
      const roots = [item.track, item.itemV3, item.itemV2, item.item, item];
      const candidates = [];
      for (const root of roots) {
        if (!root || typeof root !== 'object') continue;
        candidates.push(root, root.data, root.track, root.data?.track, root.data?.item);
      }
      const track = candidates.find((candidate) => {
        if (!candidate || typeof candidate !== 'object') return false;
        return Boolean(trackId(candidate.uri || candidate.id || candidate._uri) &&
          (candidate.title || candidate.name));
      }) || {};
      const uri = track.uri || item.uri || track.id || item.id;
      const title = track.title || track.name || item.title || item.name;
      const artistText = artistsFrom(track.artists || item.artists) || text(track.subtitle || item.subtitle);
      if (!trackId(uri) || !title || !artistText) return null;
      const durationMs = Number(track.trackDuration?.totalMilliseconds ?? track.duration_ms ?? item.duration_ms ?? track.duration ?? item.duration ?? 0);
      const albumObject = track.album || item.album || track.albumOfTrack || item.albumOfTrack;
      const addedAt = item.addedAt?.isoString || item.addedAt || item.added_at || '';
      return {
        id: trackId(uri),
        title: String(title),
        artist: artistText,
        album: albumObject?.name || albumObject?.title || '',
        durationMs: Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0,
        image: imageFrom(track) || imageFrom(item) || '',
        addedAt: String(addedAt || ''),
        positionHint: Number.isFinite(item.position) ? item.position :
          Number.isFinite(item.offset) ? item.offset + (Array.isArray(item.items) ? item.items.indexOf(item) : 0) : undefined
      };
    }
    function looksLikeTrackArray(items) {
      return Array.isArray(items) && items.length > 0 && Boolean(normalizeStructured(items.find(Boolean)));
    }
    function* walk(value, depth = 0) {
      if (!value || typeof value !== 'object' || depth > 12) return;
      yield value;
      if (Array.isArray(value)) {
        for (const child of value) yield* walk(child, depth + 1);
      } else {
        for (const child of Object.values(value)) yield* walk(child, depth + 1);
      }
    }
    function parseScripts() {
      const roots = [];
      if (window.__NEXT_DATA__) roots.push(window.__NEXT_DATA__);
      for (const script of document.querySelectorAll('script[type="application/json"], script#__NEXT_DATA__')) {
        try { roots.push(JSON.parse(script.textContent)); } catch {}
      }
      return roots;
    }
    function findState() {
      const result = { name: '', cover: '', total: 0, tracks: [] };
      outer: for (const root of parseScripts()) {
        for (const value of walk(root)) {
          if (!result.total && Number.isFinite(value.total) &&
              (Array.isArray(value.items) || Array.isArray(value.trackList))) {
            result.total = value.total;
          }
          if (!result.total && Number.isFinite(value.trackCount)) result.total = value.trackCount;
          if (typeof value.uri === 'string' && value.uri.startsWith('spotify:playlist:') && value.name) {
            result.name = text(value.name);
            result.cover = imageFrom(value);
          }
          const candidates = [value.trackList, value.tracks?.items, value.items];
          for (const list of candidates) {
            if (looksLikeTrackArray(list)) {
              result.tracks.push(...list.map(normalizeStructured).filter(Boolean));
              if (result.tracks.length >= 1000) break outer;
            }
          }
        }
      }
      // Capture Spotify's own internal pathfinder responses that are already
      // inside the page (installed by the capture patch). This is the fast path;
      // it does not depend on DOM virtualization or WebContents scroll state.
      const captures = window.__musicSpotifyCapturedResponses || [];
      for (const rawCapture of captures) {
        try {
          const capture = typeof rawCapture === 'string' ? JSON.parse(rawCapture) : rawCapture;
          const body = typeof capture.body === 'string' ? capture.body : (typeof capture === 'string' ? capture : '');
          const page = JSON.parse(body).data?.playlistV2?.content;
          if (page?.__typename === 'PlaylistItemsPage' && Array.isArray(page.items)) {
            if (!result.total && Number.isFinite(page.totalCount)) result.total = page.totalCount;
            result.tracks.push(...page.items.map(normalizeStructured).filter(Boolean));
          }
        } catch {}
      }
      return result;
    }
    function domTracks() {
      const rows = [...document.querySelectorAll('[data-testid="tracklist-row"], [role="row"]')]
        .filter((row) => {
          if (!row.querySelector('a[href*="/track/"]')) return false;
          if (row.closest('[data-testid="recommended-tracks"], [data-testid="recommended-section"], section[aria-label*="Recommended" i], [data-testid="recommendations-container"], [data-testid="track-recs"], [data-testid="playlist-recommended"]')) {
            return false;
          }
          return true;
        });
      return rows.map((row, renderedIndex) => {
        const links = [...row.querySelectorAll('a[href*="/track/"]')];
        const primary = links.find((link) =>
          link.getAttribute('data-testid') === 'internal-track-link') || links[0];
        const href = primary.getAttribute('href') || '';
        const id = trackId(href.split('/track/')[1]?.split(/[/?#]/)[0]);
        const title = text(primary.querySelector('div')?.textContent) ||
          primary.getAttribute('aria-label') || text(primary.textContent) || 'Unknown title';
        const artistElements = [...row.querySelectorAll('a[href^="/artist/"]')];
        const artistNames = [...new Set(artistElements.map((el) =>
          text(el.textContent) || el.getAttribute('aria-label')).filter(Boolean))];
        const albumElement = [...row.querySelectorAll('a[href^="/album/"]')].pop();
        const durationLabel = row.querySelector('[aria-label*="minutes" i], [data-testid="duration"], time');
        const durationMatch = /(?:(\\d+)\\s+(?:hr|hour)[^\\d]*(\\d+)\\s+min|(\\d+):([0-5]\\d))/.exec(
          durationLabel?.getAttribute('aria-label') || row.innerText || '');
        const durationMs = durationMatch
          ? (durationMatch[1] ? (Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60) :
              (Number(durationMatch[3]) * 60 + Number(durationMatch[4]))) * 1000
          : 0;
        const imageElement = row.querySelector('img[src]');
        return {
          id,
          title: title.replace(/\\s+/g, ' ').trim(),
          artist: artistNames.join(', ') || primary.getAttribute('aria-label') || '',
          album: text(albumElement?.textContent) || albumElement?.getAttribute('aria-label') || '',
          durationMs,
          image: imageElement?.currentSrc || imageElement?.src || '',
          addedAt: '',
          renderedIndex
        };
      }).filter((track) => track.id);
    }
    function metadata() {
      const state = findState();
      const name = state.name ||
        document.querySelector('h1')?.textContent?.trim() ||
        document.querySelector('meta[property="og:title"]')?.content || '';
      const cover = state.cover ||
        document.querySelector('meta[property="og:image"]')?.content ||
        document.querySelector('main img[srcset], main img[src]')?.currentSrc || '';
      const countText = document.querySelector('[data-testid="trackCount"]')?.textContent || document.body.innerText;
      const uiTotalMatch = /(\\d+)\\s+(?:songs|tracks|items)\\b/i.exec(countText.replace(/,/g, ''));
      return {
        name: name.replace(/\\s+[|·]\\s+[^|·]+$/, '').trim() || 'Spotify Playlist',
        cover,
        expectedTotal: state.total || (uiTotalMatch ? Number(uiTotalMatch[1]) : 0),
        stateTracks: state.tracks,
        location: location.href
      };
    }
    if ('${mode}' === 'state-only') return JSON.stringify(findState());
    if ('${mode}' === 'metadata') return JSON.stringify(metadata());
    return JSON.stringify({ metadata: metadata(), tracks: domTracks(), scrollHeight: document.documentElement.scrollHeight });
  })()`;
  return body;
}

/**
 * Read-only inventory used to explain why the structured path did or did not
 * win.  This intentionally reports names/counts, never private React fibers
 * or arbitrary application values.
 */
function pageInventoryScript() {
  return `(() => {
    const globals = Object.keys(window).filter((key) =>
      /spotify|playlist|redux|store|state|next|apollo|pathfinder/i.test(key)
    ).slice(0, 100);
    const applicationJson = [...document.querySelectorAll('script[type="application/json"]')]
      .map((script) => ({ id: script.id || '', bytes: (script.textContent || '').length }))
      .filter((item) => item.bytes > 0);
    const resources = performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => /pathfinder|playlist|spclient|api\\/token/i.test(name))
      .map((name) => { try { const url = new URL(name); return url.origin + url.pathname; } catch { return name; } })
      .filter((name, index, all) => all.indexOf(name) === index)
      .slice(-200);
    const captures = Array.isArray(window.__musicSpotifyCapturedResponses)
      ? window.__musicSpotifyCapturedResponses.map((capture) => {
        let parsed = null;
        try { parsed = JSON.parse(capture.body || ''); } catch {}
        const content = parsed?.data?.playlistV2?.content || parsed?.data?.playlist?.content;
        return {
          url: capture.url,
          bytes: String(capture.body || '').length,
          topKeys: parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 20) : [],
          dataKeys: parsed?.data && typeof parsed.data === 'object' ? Object.keys(parsed.data).slice(0, 20) : [],
          contentType: content?.__typename || '',
          itemCount: Array.isArray(content?.items) ? content.items.length : 0,
          totalCount: Number.isFinite(content?.totalCount) ? content.totalCount : 0,
          firstItemKeys: content?.items?.[0] && typeof content.items[0] === 'object'
            ? Object.keys(content.items[0]).slice(0, 20) : [],
          firstItemDataKeys: content?.items?.[0]?.data && typeof content.items[0].data === 'object'
            ? Object.keys(content.items[0].data).slice(0, 20) : [],
          firstItemUri: typeof content?.items?.[0]?.uri === 'string' ? content.items[0].uri : '',
          firstTrackDataKeys: content?.items?.[0]?.track?.data && typeof content.items[0].track.data === 'object'
            ? Object.keys(content.items[0].track.data).slice(0, 20) : [],
        };
      }) : [];
    return JSON.stringify({
      globals,
      applicationJson,
      resourceCount: resources.length,
      resources,
      capturedResponseCount: Array.isArray(window.__musicSpotifyCapturedResponses)
        ? window.__musicSpotifyCapturedResponses.length : 0,
      captures,
      reactRootCount: document.querySelectorAll('[data-reactroot], #main').length,
    });
  })()`;
}

/**
 * Installs an in-page observer into the Spotify WebContents main world.
 * It records the JSON/structured network responses Spotify is already
 * loading for the playlist, including all paginated track pages.
 *
 * This is deliberately non-invasive: it simply clones fetch/XHR responses
 * and does not mutate Spotify DOM or React state.
 */
function capturePatchScript() {
  return `(() => {
    if (window.__musicSpotifyCaptureInstalled) return 'already-installed';
    Object.defineProperty(window, '__musicSpotifyCaptureInstalled', { value: true });
    if (!window.__musicSpotifyCapturedResponses) {
      Object.defineProperty(window, '__musicSpotifyCapturedResponses', { value: [] });
    }
    const captured = window.__musicSpotifyCapturedResponses;
    const record = (method, url, requestPostData, status, contentType, body) => {
      try {
        if (!body || String(body).length < 2) return;
        const text = String(body);
        if (!url || !/api-partner\\.spotify\\.com\\/pathfinder/.test(url) && !/\\/playlist\\//.test(url)) return;
        if (captured.some((entry) => entry.url === url && entry.body === text)) return;
        captured.push({
          method: String(method || 'GET'),
          url: String(url),
          requestPostData: String(requestPostData || '').slice(0, 20000),
          status: Number(status || 0),
          contentType: String(contentType || ''),
          body: text.slice(0, 1000000),
        });
        if (captured.length > 32) captured.shift();
      } catch {}
    };

    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      try {
        const contentType = response.headers.get('content-type') || '';
        if (/json|text/i.test(contentType) && (typeof input === 'string' ? input : input?.url || '').includes('spotify.com')) {
          const body = await response.clone().text();
          record('fetch', typeof input === 'string' ? input : input?.url || '', init?.body, response.status, contentType, body);
        }
      } catch {}
      return response;
    };

    const RealXHR = window.XMLHttpRequest;
    function PatchedXHR() {
      const xhr = new RealXHR();
      let method = 'GET';
      let url = '';
      let postData = '';
      const originalOpen = xhr.open;
      const originalSend = xhr.send;
      xhr.open = function patchedOpen(requestMethod, requestUrl, ...rest) {
        method = requestMethod;
        url = requestUrl;
        return originalOpen.call(xhr, requestMethod, requestUrl, ...rest);
      };
      xhr.send = function patchedSend(body) {
        postData = typeof body === 'string' ? body : '';
        xhr.addEventListener('load', () => {
          try {
            const contentType = xhr.getResponseHeader('content-type') || '';
            if (/json|text/i.test(contentType) && typeof xhr.responseText === 'string') {
              record('xhr', url, postData, xhr.status, contentType, xhr.responseText);
            }
          } catch {}
        }, false);
        return originalSend.call(xhr, body);
      };
      return xhr;
    }
    PatchedXHR.prototype = RealXHR.prototype;
    window.XMLHttpRequest = PatchedXHR;
    return 'installed';
  })()`;
}

function isBlocked(location, pageText) {
  if (/^https:\/\/(accounts|open)\.spotify\.com\/(?:login|signup)/i.test(location)) return 'Spotify redirected to a login/signup wall.';
  if (/captcha|hCaptcha|reCAPTCHA|verify you are human/i.test(pageText.slice(0, 5000))) {
    return 'Spotify showed a CAPTCHA challenge.';
  }
  if (/^(log in to spotify|sign up to spotify)/i.test(pageText.trim())) return 'Spotify requires login for this playlist.';
  return '';
}

class SpotifyPlaylistScraper {
  constructor(manager = new SpotifyWebContentsManager()) {
    this.manager = manager;
  }

  destroy() {
    this.manager.destroy();
  }

  async scrape(input, options = {}) {
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    const signal = options.signal;
    const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
    return this.manager.runExclusive(async () => {
      const startedAt = Date.now();
      const deadline = startedAt + timeoutMs;
      const { playlistId, url } = normalizePlaylistTarget(input);
      const win = await this.manager.getWindow();
      const contents = win.webContents;
      let lastMilestone = 0;

      const stopCheck = () => {
        if (signal?.aborted) throw new SpotifyScrapeError('Spotify scrape was canceled.', 'canceled');
        if (Date.now() > deadline) throw new SpotifyScrapeError(`Timed out after ${Math.round(timeoutMs / 1000)} seconds.`, 'timeout');
        if (!win || win.isDestroyed()) throw new SpotifyScrapeError('The hidden Spotify renderer was destroyed.', 'renderer-destroyed');
      };

      onProgress({ type: 'navigating', fetched: 0, total: 0, url });
      // Install the capture patch as soon as the document is ready, which is
      // earlier than loadURL() resolves and catches Spotify's first pathfinder
      // pages. The patch is idempotent and survives SPA navigations, so a
      // second install right after loadURL() below is a harmless safety net.
      const installCapturePatch = () => {
        contents.executeJavaScript(capturePatchScript(), false).catch(() => {});
      };
      contents.on('dom-ready', installCapturePatch);
      try {
        await withDeadline(contents.loadURL(url, { userAgent: contents.getUserAgent() }), PAGE_WAIT_MS,
          'Timed out loading the Spotify playlist.', signal);
      } catch (error) {
        contents.removeListener('dom-ready', installCapturePatch);
        if (signal?.aborted || error.code === 'canceled') throw error;
        throw new SpotifyScrapeError(`Could not load Spotify playlist: ${error.message}`, 'navigation-failed');
      }
      contents.removeListener('dom-ready', installCapturePatch);

      // Install the structured-response capture patch as soon as navigation
      // resolves. Spotify may still be initializing its fetchers at this point,
      // so this maximizes the chance the observer catches pathfinder pages.
      await withDeadline(contents.executeJavaScript(capturePatchScript(), false), 5000,
        'Failed to install Spotify capture patch.', signal);

      await withDeadline(new Promise((resolve, reject) => {
        const poll = async () => {
          try {
            stopCheck();
            const script = `(function(){return JSON.stringify({location:location.href,text:document.body?.innerText||'',rows:document.querySelectorAll('[data-testid="tracklist-row"], a[href*="/track/"]').length})})()`;
            const raw = await contents.executeJavaScript(script, false);
            const snapshot = JSON.parse(raw);
            const blocked = isBlocked(snapshot.location, snapshot.text);
            if (blocked) return reject(new SpotifyScrapeError(blocked, 'access-blocked'));
            if (snapshot.rows > 0) return resolve();
            setTimeout(poll, 250);
          } catch (error) {
            if (error instanceof SpotifyScrapeError) reject(error); else setTimeout(poll, 250);
          }
        };
        poll();
      }), PAGE_WAIT_MS, 'Spotify playlist rows did not render.', signal);

      const metadataRaw = await withDeadline(contents.executeJavaScript(extractionScript('metadata'), false),
        10_000, 'Failed to inspect Spotify metadata.', signal);
      const metadata = JSON.parse(metadataRaw);
      if (isBlocked(metadata.location, '')) throw new SpotifyScrapeError(isBlocked(metadata.location, ''), 'access-blocked');

      // Fast structured path: inspect what Spotify already exposed.  Do not
      // scroll to manufacture a "structured" result: if the page only has a
      // virtualized window, the existing DOM scraper is the honest fallback.
      const fastPathStart = Date.now();
      const structuredEntries = new Map();
      const structuredTriggerDeadline = Math.min(deadline, fastPathStart + Number(process.env.SPOTIFY_FAST_PATH_TIMEOUT_MS || 600));
      let lastGrowth = fastPathStart;
      let previousStructuredSize = -1;
      while (options.method !== 'dom-scroll' && Date.now() < structuredTriggerDeadline) {
        stopCheck();
        const fastRaw = await withDeadline(contents.executeJavaScript(extractionScript('metadata'), false), 5000,
          'Failed to read Spotify structured state.', signal);
        const fastSnapshot = JSON.parse(fastRaw);
        if (fastSnapshot.expectedTotal && !metadata.expectedTotal) metadata.expectedTotal = fastSnapshot.expectedTotal;
        const beforeFastCount = structuredEntries.size;
        for (const track of fastSnapshot.stateTracks) this.remember(track, structuredEntries);
        const fastCount = structuredEntries.size;
        if (fastCount !== previousStructuredSize) {
          console.log(`[spotify-poc] Structured tracks: ${fastCount}/${metadata.expectedTotal || '?'} in ${Date.now() - fastPathStart}ms`);
          previousStructuredSize = fastCount;
        }
        if (metadata.expectedTotal && fastCount >= metadata.expectedTotal) break;
        if (fastCount > beforeFastCount) lastGrowth = Date.now();
        if (Date.now() - lastGrowth > 400 && fastCount > 1) break;
        await sleep(100, signal);
      }

      let pageInventory = null;
      if (options.method !== 'dom-scroll') {
        try {
          pageInventory = JSON.parse(await contents.executeJavaScript(pageInventoryScript(), false));
        } catch (error) {
          console.warn('[spotify-poc] Could not inspect Spotify page inventory:', error.message);
        }
      }

      const structuredComplete = Boolean(metadata.expectedTotal && structuredEntries.size >= metadata.expectedTotal);
      const structuredExtractionMs = Date.now() - fastPathStart;
      if (structuredComplete) {
        const finalMetadata = JSON.parse(await contents.executeJavaScript(extractionScript('metadata'), false));
        const tracks = [...structuredEntries.values()].sort((a, b) => a.firstIndex - b.firstIndex)
          .slice(0, finalMetadata.expectedTotal || undefined).map((entry) => ({ ...entry.track }));
        console.log(`[spotify-poc] Fast structured finished in ${Date.now() - startedAt}ms`);
        return {
          playlist: { id: playlistId, name: finalMetadata.name || metadata.name || 'Spotify Playlist', image: finalMetadata.cover || metadata.cover || '' },
          tracks,
          diagnostics: {
            expectedTotal: finalMetadata.expectedTotal || metadata.expectedTotal,
            collected: tracks.length,
            elapsedMs: Date.now() - startedAt,
            method: 'structured',
            pageLoadMs: fastPathStart - startedAt,
            structuredExtractionMs,
            extractionMs: structuredExtractionMs,
            fallbackMs: 0,
            pageInventory,
          },
        };
      }

      const fallbackStart = Date.now();
      structuredEntries.clear();

      // Ensure scroll container is at top
      await contents.executeJavaScript(`(function(){
        const row = document.querySelector('[data-testid="tracklist-row"]') || document.querySelector('a[href*="/track/"]');
        let curr = row ? row.parentElement : null;
        while (curr && curr !== document.body) {
          const style = window.getComputedStyle(curr);
          if (['auto', 'scroll', 'overlay'].includes(style.overflowY) && curr.scrollHeight > curr.clientHeight + 40) {
            curr.scrollTop = 0;
            return;
          }
          curr = curr.parentElement;
        }
        const viewports = [...document.querySelectorAll('[data-overlayscrollbars-viewport]')];
        viewports.sort((a, b) => (b.scrollHeight * b.clientWidth) - (a.scrollHeight * a.clientWidth));
        if (viewports[0]) viewports[0].scrollTop = 0;
      })()`, false);
      await sleep(400, signal);

      const entries = structuredEntries;
      let noGrowthCycles = 0;
      let previousScrollTop = -1;

      const collect = async () => {
        stopCheck();
        const raw = await withDeadline(contents.executeJavaScript(extractionScript('all'), false), 20_000,
          'Failed to extract rendered Spotify rows.', signal);
        const snapshot = JSON.parse(raw);
        // Partial page state is deliberately not merged into the DOM fallback.
        // Spotify commonly exposes only its first 25-item response; mixing that
        // response into the virtualized collector can make its bottom sentinel
        // appear complete before all rows have rendered.
        if (structuredComplete) {
          for (const track of snapshot.metadata.stateTracks) this.remember(track, entries);
        }
        for (const track of snapshot.tracks) this.remember(track, entries);
        const count = entries.size;
        if (count !== lastMilestone) {
          onProgress({ type: 'progress', fetched: count, total: snapshot.metadata.expectedTotal || count });
          if (count - lastMilestone >= 25 || (snapshot.metadata.expectedTotal && count === snapshot.metadata.expectedTotal)) {
            console.log(`[spotify-poc] Collected tracks: ${count}`);
            lastMilestone = count;
          }
        }
        return snapshot;
      };

      await collect();
      let cycles = 0;
      const maxNoGrowth = metadata.expectedTotal ? 12 : 16;
      while (entries.size < (metadata.expectedTotal || Number.MAX_SAFE_INTEGER)) {
        stopCheck();
        const before = entries.size;

        const scrolled = await withDeadline(contents.executeJavaScript(`(function(){
          function isActuallyScrollable(el) {
            if (!el || el === document.body || el === document.documentElement) return false;
            const style = window.getComputedStyle(el);
            if (!['auto', 'scroll', 'overlay'].includes(style.overflowY)) return false;
            return el.scrollHeight > el.clientHeight + 40;
          }
          function getMainScrollContainer() {
            const row = document.querySelector('[data-testid="tracklist-row"]') || document.querySelector('a[href*="/track/"]');
            if (row) {
              let curr = row.parentElement;
              while (curr && curr !== document.body) {
                if (isActuallyScrollable(curr)) return curr;
                curr = curr.parentElement;
              }
            }
            const all = [...document.querySelectorAll('*')].filter(isActuallyScrollable);
            all.sort((a, b) => (b.scrollHeight * b.clientWidth) - (a.scrollHeight * a.clientWidth));
            if (all[0]) return all[0];
            return document.scrollingElement || document.documentElement;
          }
          const container = getMainScrollContainer();
          const before = container ? container.scrollTop : window.scrollY;
          const clientHeight = container ? container.clientHeight : window.innerHeight;
          const scrollHeight = container ? container.scrollHeight : document.documentElement.scrollHeight;
          const delta = Math.min(320, Math.max(200, Math.round(clientHeight * 0.45)));
          
          const rows = document.querySelectorAll('[data-testid="tracklist-row"]');
          const lastRow = rows[rows.length - 1];
          if (lastRow) {
            try { lastRow.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch {}
          }

          if (container) {
            container.scrollTop += delta;
            container.dispatchEvent(new Event('scroll', { bubbles: true }));
            const target = lastRow || container;
            target.dispatchEvent(new WheelEvent('wheel', { deltaY: delta, bubbles: true, cancelable: true }));
          }
          window.scrollBy(0, delta);
          const after = container ? container.scrollTop : window.scrollY;
          return JSON.stringify({
            scrollTop: after,
            before,
            height: scrollHeight,
            clientHeight,
            rowCount: rows.length,
            selector: container ? (container.tagName + '.' + String(container.className||'').slice(0,60)) : 'window'
          });
        })()`, false), 10_000, 'Unable to scroll Spotify playlist.', signal);

        const scroll = JSON.parse(scrolled);
        
        // Allow Spotify React virtualization to render new rows
        await sleep(200, signal);
        await collect();

        if (metadata.expectedTotal && entries.size >= metadata.expectedTotal) {
          break;
        }

        const isAtBottom = scroll.height > 1000 && scroll.scrollTop >= scroll.height - scroll.clientHeight - 15;
        if (entries.size > before) {
          noGrowthCycles = 0;
        } else {
          noGrowthCycles++;
          if (isAtBottom) {
            // Trigger bottom sentinel
            await contents.executeJavaScript(`(function(){
              const rows = document.querySelectorAll('[data-testid="tracklist-row"]');
              const last = rows[rows.length - 1];
              if (last) last.scrollIntoView({ block: 'end' });
              window.dispatchEvent(new Event('resize'));
            })()`, false);
            await sleep(600, signal);
            await collect();
            if (entries.size > before) noGrowthCycles = 0;
          }
        }

        if (noGrowthCycles >= maxNoGrowth || (scroll.scrollTop === previousScrollTop && noGrowthCycles >= 8 && isAtBottom)) {
          await sleep(500, signal);
          await collect();
          break;
        }
        previousScrollTop = scroll.scrollTop;
        cycles++;
      }

      await collect();
      const finalMetadataRaw = await contents.executeJavaScript(extractionScript('metadata'), false);
      const finalMetadata = JSON.parse(finalMetadataRaw);
      const expected = finalMetadata.expectedTotal || metadata.expectedTotal;
      let tracks = [...entries.values()].sort((a, b) => a.firstIndex - b.firstIndex)
        .map((entry) => ({ ...entry.track }));
      if (expected && tracks.length > expected) {
        tracks = tracks.slice(0, expected);
      }
      const collected = tracks.length;
      console.log(`[spotify-poc] DOM fallback finished in ${Date.now() - startedAt}ms`);
      console.log(`Expected: ${expected || 'unknown'}`);
      console.log(`Collected: ${collected}`);
      if (expected && collected < expected) {
        throw new SpotifyScrapeError(
          `Incomplete Spotify retrieval: Expected ${expected}, Collected ${collected}.`,
          'incomplete-playlist'
        );
      }
      if (!collected) throw new SpotifyScrapeError('No tracks were exposed by Spotify.', 'empty-playlist');
      return {
        playlist: {
          id: playlistId,
          name: finalMetadata.name || metadata.name || 'Spotify Playlist',
          image: finalMetadata.cover || metadata.cover || ''
        },
        tracks,
        diagnostics: {
          expectedTotal: expected,
          collected,
          elapsedMs: Date.now() - startedAt,
          method: 'dom-scroll',
          pageLoadMs: fastPathStart - startedAt,
          structuredExtractionMs,
          extractionMs: 0,
          fallbackMs: Date.now() - fallbackStart,
          pageInventory,
        }
      };
    });
  }

  remember(track, entries) {
    if (!track?.id || !track.title || !track.artist) return;
    const existing = entries.get(track.id);
    if (existing) {
      existing.track = {
        ...existing.track,
        ...Object.fromEntries(Object.entries(track).filter(([, value]) => value !== '' && value != null)),
        id: existing.track.id,
        title: existing.track.title,
        artist: existing.track.artist || track.artist,
      };
      return;
    }
    entries.set(track.id, { firstIndex: entries.size, track });
  }
}

module.exports = { SpotifyPlaylistScraper, SpotifyScrapeError, normalizePlaylistTarget };

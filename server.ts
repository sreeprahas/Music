import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { initDatabase, readDatabase, writeDatabase } from './server/db.js';
import {
  ensureYtdlpBinary,
  fetchTrackInfo,
  getDirectAudioStreamUrl,
  searchYoutubeTracks,
  createAudioStreamProcess,
} from './server/ytdlp.js';

dotenv.config();

const app = express();
const PORT = 3000;
const AUTHORIZED_EMAIL = (process.env.AUTHORIZED_EMAIL || 'minecraftprahas@gmail.com').toLowerCase().trim();

app.use(express.json());
app.use(cookieParser());

// Initialize local JSON storage
initDatabase();

// Pre-warm yt-dlp binary asynchronously
ensureYtdlpBinary().catch((err) => {
  console.warn('[server] Pre-warm yt-dlp failed, will retry on demand:', err.message);
});

// Helper for session check
function getAuthenticatedUser(req: express.Request) {
  const sessionCookie = req.cookies?.ytm_session;
  if (!sessionCookie) return null;

  try {
    const user = JSON.parse(Buffer.from(sessionCookie, 'base64').toString('utf-8'));
    if (user && user.email && user.email.toLowerCase().trim() === AUTHORIZED_EMAIL) {
      return user;
    }
  } catch (e) {
    // invalid cookie
  }
  return null;
}

// Middleware: Strict Single-User Security check
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(403).json({
      error: 'Unauthorized',
      message: `Access restricted. Only ${AUTHORIZED_EMAIL} is authorized to access this personal instance.`,
      authorizedEmail: AUTHORIZED_EMAIL,
    });
    return;
  }
  (req as any).user = user;
  next();
}

// --- Auth Endpoints ---

app.get('/api/auth/session', (req, res) => {
  const user = getAuthenticatedUser(req);
  res.json({
    authorizedEmail: AUTHORIZED_EMAIL,
    user: user ? { ...user, isAuthorized: true } : null,
  });
});

app.post('/api/auth/google-login', (req, res) => {
  const { email, name, image, credential } = req.body;

  if (!email || email.toLowerCase().trim() !== AUTHORIZED_EMAIL) {
    res.status(403).json({
      success: false,
      error: 'Access Denied',
      message: `Only ${AUTHORIZED_EMAIL} is allowed to authenticate with this personal YouTube Music app. Received: ${email || 'none'}.`,
    });
    return;
  }

  const sessionData = {
    email: email.toLowerCase().trim(),
    name: name || 'Prahas',
    image: image || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    authenticatedAt: new Date().toISOString(),
  };

  const cookieVal = Buffer.from(JSON.stringify(sessionData)).toString('base64');
  res.cookie('ytm_session', cookieVal, {
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: 'lax',
    path: '/',
  });

  res.json({ success: true, user: { ...sessionData, isAuthorized: true } });
});

app.post('/api/auth/quick-auth', (req, res) => {
  const { email } = req.body;
  const targetEmail = (email || AUTHORIZED_EMAIL).toLowerCase().trim();

  if (targetEmail !== AUTHORIZED_EMAIL) {
    res.status(403).json({
      success: false,
      error: 'Access Denied',
      message: `Email ${targetEmail} is not authorized. Only ${AUTHORIZED_EMAIL} can log in.`,
    });
    return;
  }

  const sessionData = {
    email: AUTHORIZED_EMAIL,
    name: 'Prahas (Owner)',
    image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    authenticatedAt: new Date().toISOString(),
  };

  const cookieVal = Buffer.from(JSON.stringify(sessionData)).toString('base64');
  res.cookie('ytm_session', cookieVal, {
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    path: '/',
  });

  res.json({ success: true, user: { ...sessionData, isAuthorized: true } });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('ytm_session', { path: '/' });
  res.json({ success: true });
});

// --- Library & Playlist API (reads & writes data/playlists.json) ---

app.get('/api/library', requireAuth, (req, res) => {
  const data = readDatabase();
  res.json(data);
});

app.post('/api/library/tracks', requireAuth, async (req, res) => {
  try {
    const { url, videoId, playlistId } = req.body;
    const targetInput = url || videoId;

    if (!targetInput) {
      res.status(400).json({ error: 'Missing url or videoId parameter' });
      return;
    }

    const trackInfo = await fetchTrackInfo(targetInput);
    const db = readDatabase();

    db.tracks[trackInfo.id] = trackInfo;

    if (playlistId) {
      const playlist = db.playlists.find((p) => p.id === playlistId);
      if (playlist && !playlist.trackIds.includes(trackInfo.id)) {
        playlist.trackIds.push(trackInfo.id);
        playlist.updatedAt = new Date().toISOString();
      }
    }

    writeDatabase(db);
    res.json({ success: true, track: trackInfo, library: db });
  } catch (error: any) {
    console.error('Error adding track:', error);
    res.status(500).json({ error: 'Failed to extract track via yt-dlp', message: error.message });
  }
});

app.delete('/api/library/tracks/:id', requireAuth, (req, res) => {
  const trackId = req.params.id;
  const db = readDatabase();

  if (db.tracks[trackId]) {
    delete db.tracks[trackId];
  }

  db.playlists.forEach((p) => {
    p.trackIds = p.trackIds.filter((id) => id !== trackId);
  });

  db.likedTrackIds = db.likedTrackIds.filter((id) => id !== trackId);
  db.recentlyPlayedIds = db.recentlyPlayedIds.filter((id) => id !== trackId);

  writeDatabase(db);
  res.json({ success: true, library: db });
});

app.post('/api/library/tracks/:id/like', requireAuth, (req, res) => {
  const trackId = req.params.id;
  const db = readDatabase();

  if (!db.likedTrackIds) db.likedTrackIds = [];

  const isLiked = db.likedTrackIds.includes(trackId);
  if (isLiked) {
    db.likedTrackIds = db.likedTrackIds.filter((id) => id !== trackId);
    if (db.tracks[trackId]) db.tracks[trackId].liked = false;
  } else {
    db.likedTrackIds.push(trackId);
    if (db.tracks[trackId]) db.tracks[trackId].liked = true;
  }

  writeDatabase(db);
  res.json({ success: true, liked: !isLiked, likedTrackIds: db.likedTrackIds });
});

app.post('/api/library/playlists', requireAuth, (req, res) => {
  const { name, description, coverUrl, trackIds } = req.body;
  const db = readDatabase();

  const newPlaylist = {
    id: `p-${Date.now()}`,
    name: name || 'New Playlist',
    description: description || '',
    coverUrl: coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    trackIds: trackIds || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.playlists.push(newPlaylist);
  writeDatabase(db);
  res.json({ success: true, playlist: newPlaylist, library: db });
});

app.put('/api/library/playlists/:id', requireAuth, (req, res) => {
  const playlistId = req.params.id;
  const { name, description, coverUrl, trackIds } = req.body;
  const db = readDatabase();

  const index = db.playlists.findIndex((p) => p.id === playlistId);
  if (index === -1) {
    res.status(404).json({ error: 'Playlist not found' });
    return;
  }

  if (name !== undefined) db.playlists[index].name = name;
  if (description !== undefined) db.playlists[index].description = description;
  if (coverUrl !== undefined) db.playlists[index].coverUrl = coverUrl;
  if (trackIds !== undefined) db.playlists[index].trackIds = trackIds;
  db.playlists[index].updatedAt = new Date().toISOString();

  writeDatabase(db);
  res.json({ success: true, playlist: db.playlists[index], library: db });
});

app.delete('/api/library/playlists/:id', requireAuth, (req, res) => {
  const playlistId = req.params.id;
  const db = readDatabase();

  db.playlists = db.playlists.filter((p) => p.id !== playlistId);
  writeDatabase(db);
  res.json({ success: true, library: db });
});

app.post('/api/library/history', requireAuth, (req, res) => {
  const { videoId } = req.body;
  if (!videoId) {
    res.status(400).json({ error: 'Missing videoId' });
    return;
  }

  const db = readDatabase();
  db.recentlyPlayedIds = [videoId, ...db.recentlyPlayedIds.filter((id) => id !== videoId)].slice(0, 30);
  writeDatabase(db);
  res.json({ success: true });
});

// --- Search & yt-dlp Streaming APIs ---

app.get('/api/search', requireAuth, async (req, res) => {
  try {
    const query = (req.query.q as string) || '';
    if (!query) {
      res.json({ results: [] });
      return;
    }

    const results = await searchYoutubeTracks(query, 10);
    res.json({ results });
  } catch (error: any) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search YouTube tracks', message: error.message });
  }
});

app.get('/api/resolve-track', requireAuth, async (req, res) => {
  try {
    const url = req.query.url as string;
    if (!url) {
      res.status(400).json({ error: 'Query parameter url required' });
      return;
    }

    const track = await fetchTrackInfo(url);
    res.json({ track });
  } catch (error: any) {
    console.error('Resolve error:', error);
    res.status(500).json({ error: 'Failed to resolve track details', message: error.message });
  }
});

app.get('/api/stream/:videoId', requireAuth, async (req, res) => {
  try {
    const { videoId } = req.params;
    const directUrl = await getDirectAudioStreamUrl(videoId);
    res.json({ videoId, streamUrl: directUrl, proxyUrl: `/api/audio-proxy/${videoId}` });
  } catch (error: any) {
    console.error(`Stream extraction error for ${req.params.videoId}:`, error);
    res.status(500).json({ error: 'Audio provider error', message: error.message });
  }
});

app.get('/api/audio-proxy/:videoId', requireAuth, async (req, res) => {
  try {
    const { videoId } = req.params;
    const directUrl = await getDirectAudioStreamUrl(videoId);

    // Redirect to direct URL or pipe
    res.redirect(directUrl);
  } catch (error: any) {
    console.error('Audio proxy error:', error);
    res.status(500).json({ error: 'Failed to stream audio' });
  }
});

// --- Vite Middleware / Server Start ---

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[YouTube Music Personal] Server running on http://0.0.0.0:${PORT}`);
    console.log(`[Auth] Strict Single-User Authorized Email: ${AUTHORIZED_EMAIL}`);
  });
}

start();

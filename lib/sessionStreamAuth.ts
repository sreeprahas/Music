import crypto from 'crypto';

export interface PlaybackSessionState {
  sessionId: string;
  videoId: string;
  token: string;
  createdAt: number;
  expiresAt: number;
  lastAccessAt: number;
  requestCount: number;
  windowStart: number;
  clientIp: string;
  userId: string;
  continuityCounters: { pat: number; pmt: number; audio: number };
}

const STREAM_SECRET = process.env.STREAM_SECRET || 'music-app-protected-stream-auth-key-2026';
const MAX_ACTIVE_SESSIONS_PER_USER = 6;
const SESSION_EXPIRY_MS = 3 * 60 * 1000; // 3 minutes initial authorization window
const SESSION_RENEWAL_MS = 45 * 1000; // 45 seconds refresh window

// In-memory playback session store
const activeSessions = new Map<string, PlaybackSessionState>();

// Clean up expired sessions every 60s
if (typeof window === 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [id, session] of activeSessions.entries()) {
      if (now > session.expiresAt + 60000) {
        activeSessions.delete(id);
      }
    }
  }, 60000);
}

/**
 * Creates a short-lived playback session for a track
 */
export function createPlaybackSession(
  videoId: string,
  clientIp = '127.0.0.1',
  userId = 'anonymous'
): { sessionId: string; token: string; expiresAt: number } | null {
  const activeForUser = Array.from(activeSessions.values()).filter(
    (session) => session.userId === userId || session.clientIp === clientIp
  );
  if (activeForUser.length >= MAX_ACTIVE_SESSIONS_PER_USER) {
    return null;
  }

  const sessionId = crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  const expiresAt = now + SESSION_EXPIRY_MS;

  const payload = `${sessionId}:${videoId}:${expiresAt}:${userId}`;
  const token = crypto.createHmac('sha256', STREAM_SECRET).update(payload).digest('hex');

  const sessionState: PlaybackSessionState = {
    sessionId,
    videoId,
    token,
    createdAt: now,
    expiresAt,
    lastAccessAt: now,
    requestCount: 0,
    windowStart: now,
    clientIp,
    userId,
    continuityCounters: { pat: 0, pmt: 0, audio: 0 },
  };

  activeSessions.set(sessionId, sessionState);
  return { sessionId, token, expiresAt };
}

/**
 * Renews an active playback session — only extends expiry, keeps the same token.
 * The token is embedded in manifest segment URLs and MUST NOT change during playback.
 */
export function renewPlaybackSession(
  sessionId: string,
  token: string,
  userId: string
): { token: string; expiresAt: number } | null {
  const session = activeSessions.get(sessionId);
  if (!session) return null;

  if (session.userId !== userId) {
    return null;
  }

  // Verify token matches (token never changes — just check equality)
  if (token !== session.token) {
    return null;
  }

  const now = Date.now();
  session.expiresAt = now + SESSION_RENEWAL_MS;
  session.lastAccessAt = now;

  return { token: session.token, expiresAt: session.expiresAt };
}

/**
 * Verifies playback session token without counting manifest requests.
 */
export function verifyPlaybackSession(
  sessionId: string,
  token: string
): { valid: boolean; videoId?: string; errorMessage?: string } {
  const session = activeSessions.get(sessionId);

  if (!session) {
    return { valid: false, errorMessage: 'Playback session expired or not found' };
  }

  const now = Date.now();
  if (now > session.expiresAt) {
    activeSessions.delete(sessionId);
    return { valid: false, errorMessage: 'Playback session token expired' };
  }

  if (session.token !== token) {
    activeSessions.delete(sessionId);
    return { valid: false, errorMessage: 'Invalid playback session token' };
  }

  session.lastAccessAt = now;
  return { valid: true, videoId: session.videoId };
}

/**
 * Verifies session token and checks segment request rate limits.
 */
export function verifyAndTrackSegmentRequest(
  sessionId: string,
  token: string,
  clientIp = '127.0.0.1'
): { valid: boolean; videoId?: string; errorMessage?: string } {
  const session = activeSessions.get(sessionId);

  if (!session) {
    return { valid: false, errorMessage: 'Playback session expired or not found' };
  }

  const now = Date.now();
  if (now > session.expiresAt) {
    activeSessions.delete(sessionId);
    return { valid: false, errorMessage: 'Playback session token expired' };
  }

  if (session.token !== token) {
    activeSessions.delete(sessionId);
    return { valid: false, errorMessage: 'Invalid playback session token' };
  }

  // Rate Limiting & Abnormal Request Detection:
  // Legitimate HLS playback requests 1 segment (~4s of audio) every 3-4s.
  // If an IDM or automated scraper tries to burst-download > 15 segments within 2 seconds, revoke session!
  if (now - session.windowStart < 2000) {
    session.requestCount++;
    if (session.requestCount > 15) {
      console.warn(`[Anti-Scrape] Revoking session ${sessionId} due to abnormal segment request burst (${session.requestCount} reqs/2s)`);
      activeSessions.delete(sessionId);
      return { valid: false, errorMessage: 'Abnormal segment request pattern detected. Session revoked.' };
    }
  } else {
    session.windowStart = now;
    session.requestCount = 1;
  }

  session.lastAccessAt = now;
  return { valid: true, videoId: session.videoId };
}

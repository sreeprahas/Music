/**
 * Spotify web-player TOTP parameter generation.
 *
 * Spotify's token endpoint requires TOTP parameters (`totp`, `totpServer`,
 * `totpVer`) validated against secret strings that ship inside Spotify's own
 * `web-player.<hash>.js` bundle as `{ secret: "...", version: N }` literals.
 * We extract them at runtime so rotation needs no code changes.
 *
 * The transform below mirrors the web player's own code exactly:
 *
 *   codes = secret.split('').map((c, i) => c.charCodeAt(0) ^ (i % 33 + 9))
 *   key   = utf8Bytes(codes.join(''))     // yes — the decimal digit string
 *   totp  = HOTP-SHA1-6(key, floor(now / 30))
 *
 * `totp` is computed from client time, `totpServer` from Spotify's server
 * clock (`/api/server-time`), and `totpVer` selects the secret version.
 */

import { createHmac } from 'crypto';

export interface TotpParams {
  totp: string;
  /** Recomputed from Spotify's server clock; the endpoint compares both. */
  totpServer: string;
  totpVer: string;
}

const HOMEPAGE_URL = 'https://open.spotify.com/';
const SERVER_TIME_URL = 'https://open.spotify.com/api/server-time';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: '*/*',
} as const;

const SECRETS_CACHE_TTL_MS = 60 * 60 * 1000;

interface TotpSecret {
  version: number;
  /** HMAC key: UTF-8 bytes of the joined decimal digit string. */
  key: Buffer;
}

let secretsCache: { secrets: TotpSecret[]; fetchedAt: number } | null = null;

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

/** Scrape the current {secret, version} pairs out of the web-player bundle. */
export async function extractWebPlayerSecrets(): Promise<TotpSecret[]> {
  const homepage = await fetchText(HOMEPAGE_URL, 10_000);
  const bundleMatch = /"(https:\/\/[^" ]+\/web-player\.[0-9a-f]+\.js)"/.exec(homepage);
  if (!bundleMatch?.[1]) {
    throw new Error('web-player bundle URL not found on Spotify homepage');
  }

  const bundle = await fetchText(bundleMatch[1], 15_000);
  const literalRe = /\{\s*secret\s*:\s*(["'])(.*?)\1\s*,\s*version\s*:\s*(\d+)\s*\}/g;
  const secrets: TotpSecret[] = [];
  for (const match of bundle.matchAll(literalRe)) {
    const codes = [...match[2]].map((ch, index) => ch.charCodeAt(0) ^ ((index % 33) + 9));
    secrets.push({ version: Number(match[3]), key: Buffer.from(codes.join(''), 'utf8') });
  }
  if (secrets.length === 0) {
    throw new Error('no TOTP secrets found in web-player bundle');
  }
  // The web player consumes entry [0]; the bundle lists newest first — keep that order.
  return secrets;
}

async function getActiveSecret(): Promise<TotpSecret> {
  if (!secretsCache || Date.now() - secretsCache.fetchedAt > SECRETS_CACHE_TTL_MS) {
    const secrets = await extractWebPlayerSecrets();
    secretsCache = { secrets, fetchedAt: Date.now() };
  }
  return secretsCache.secrets[0];
}

/** Spotify exposes its clock so clients can compensate for local skew. */
async function getServerTime(): Promise<number | null> {
  try {
    const body = JSON.parse(await fetchText(SERVER_TIME_URL, 5000)) as Record<string, unknown>;
    const serverTime = Number(body['serverTime']);
    if (Number.isFinite(serverTime) && serverTime > 0) return serverTime;
  } catch { /* let generateTotpParams send the web player's unavailable marker */ }
  return null;
}

/** RFC 4226-style 6-digit HOTP, HMAC-SHA1 over a 30s counter. */
function hotp6(key: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  message.writeUInt32BE(counter % 2 ** 32, 4);

  const digest = createHmac('sha1', key).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(code % 1_000_000).padStart(6, '0');
}

/**
 * Generate the TOTP query parameters for the token endpoint.
 *
 * @param nowSeconds Optional unix seconds overriding client time (tests).
 */
export async function generateTotpParams(nowSeconds?: number): Promise<TotpParams> {
  const { version, key } = await getActiveSecret();
  const clientSeconds = nowSeconds ?? Math.floor(Date.now() / 1000);
  // The web player sends the literal string "unavailable" when its clock probe
  // fails; it does not silently substitute client time for totpServer.
  const serverSeconds = await getServerTime();
  return {
    totp: hotp6(key, Math.floor(clientSeconds / 30)),
    totpServer:
      typeof serverSeconds === 'number'
        ? hotp6(key, Math.floor(serverSeconds / 30))
        : 'unavailable',
    totpVer: String(version),
  };
}

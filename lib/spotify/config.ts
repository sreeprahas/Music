export type SpotifyProviderName = 'spotapi';
export const SPOTIFY_PROVIDER = (process.env.SPOTIFY_PROVIDER || 'spotapi').toLowerCase() as SpotifyProviderName;
export function assertSupportedProvider(): void { if (SPOTIFY_PROVIDER !== 'spotapi') throw new Error(`Unsupported Spotify provider: ${SPOTIFY_PROVIDER}`); }

# Spotify desktop integration

## Web API authentication

Create a Spotify developer application and set `SPOTIFY_CLIENT_ID` in the environment used to start Electron. Register the exact loopback URI from `SPOTIFY_REDIRECT_URI` (default `http://127.0.0.1:47822/callback`). The app uses Authorization Code with PKCE. The client secret is not used or shipped. The Electron main process listens only on that loopback callback, validates `state`, exchanges the code, and stores the token envelope through Electron `safeStorage` in the OS credential-backed data directory.

The renderer only receives connection status. Access and refresh tokens never cross the preload bridge or Next.js API response. Disconnect removes the encrypted token file and invalidates Spotify metadata cache entries.

If the callback port is occupied, choose another fixed loopback port, update `SPOTIFY_REDIRECT_URI`, and register the same URI in the dashboard. Do not add a cookie-based fallback.

## Real Spotify Connect

The app uses the maintained `librespot` project as an optional, separately installed Connect receiver. Set `LIBRESPOT_PATH` to the exact executable and optionally set `SPOTIFY_CONNECT_NAME` (default `Music`). The supervisor starts librespot with OAuth authentication, cache isolation, discovery enabled, and a real audio backend. Its device is visible to Spotify only while the process is alive and authenticated.

The app never reports a fake device. Without a valid librespot executable, Connect status is `unavailable`. The Web API controls (`play`, `pause`, `resume`, `seek`, `volume`, `next`, `previous`) target the discovered librespot device; metadata/search and YouTube playback remain separate features.

librespot requires a Spotify Premium account and may require a platform audio backend. Install a current release from the [librespot project](https://github.com/librespot-org/librespot), verify that `librespot --help` includes `--enable-oauth`, and test the executable manually before setting `LIBRESPOT_PATH`.

## Local development

1. Copy `.env.example` to `.env.local` and set `SPOTIFY_CLIENT_ID`.
2. Run `npm install` and `npm run build`.
3. Run `npm run electron:dev`.
4. Select **Connect Spotify**. Complete the Spotify authorization window.
5. If Connect is configured, complete the separate librespot OAuth window and select the `SPOTIFY_CONNECT_NAME` device from Spotify.

The normal Next server can build and render without Electron, but Spotify API calls intentionally return an unavailable bridge error outside Electron. No Spotify cookies or browser session files are supported.

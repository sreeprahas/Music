# Music

Electron and Next.js music library with Spotify metadata, local playlists, and a SpotiFLAC REST backend for audio acquisition.

## Music backend

```text
Spotify metadata/search
        ↓
Next.js MusicService
        ↓ HTTP (/api/v1)
SpotiFLAC REST service
        ↓
User-configured provider extensions
        ↓
Lossless download and tagging
        ↓
Shared local library/cache
        ↓
App-controlled Range audio route
```

The app uses SpotiFLAC's versioned REST API for Spotify search, URL resolution, and durable download jobs. It never sends provider credentials or provider URLs to the renderer. The frontend receives app routes such as `/api/music/audio/:trackId`.

## Configure SpotiFLAC

When the Electron app opens, it checks `SPOTIFLAC_URL`; if no local service is already running, it creates a private Python virtual environment, installs SpotiFLAC into it when missing, then starts the REST API in the background with `python -m SpotiFLAC --web`. The app waits for the REST API before opening its window and stops the service it started when the app exits. A healthy service already running at the configured URL is reused.

```sh
py -m pip install SpotiFLAC
```

Configure at least one provider extension and its credentials in SpotiFLAC itself. The module ships without a default provider. See its [REST API guide](https://github.com/BartolomeoRusso9/SpotiFLAC-Module-Version/blob/main/docs/guide/rest-api.md), [extension guide](https://github.com/BartolomeoRusso9/SpotiFLAC-Module-Version/blob/main/docs/guide/extensions.md), and [Docker guide](https://github.com/BartolomeoRusso9/SpotiFLAC-Module-Version/blob/main/docs/guide/docker.md). Use only provider extensions you are authorized to use and that comply with their terms and applicable law.

Copy `.env.example` to `.env.local`, then set:

- `SPOTIFLAC_URL` to the service origin (the default is `http://127.0.0.1:8000`).
- `SPOTIFLAC_API_KEY` only if the service has `--web-token` enabled. The API accepts the token as a query parameter, and the app adds it only on server-side requests.
- `SPOTIFLAC_TIMEOUT` in milliseconds for REST calls.
- `SPOTIFLAC_CACHE_DIR` to the required shared output directory where SpotiFLAC writes completed downloads. Both processes must see the same files. The app creates this directory if it does not exist; configure SpotiFLAC to use that exact directory. The documented REST API does not expose server file paths or an audio-stream endpoint.
- `SPOTIFLAC_PYTHON` optionally overrides the Python executable used to create the app-managed environment (defaults to `py` on Windows and `python3` elsewhere).

Open the Electron app with `npm run electron` or `npm run electron:dev`; SpotiFLAC starts before the app window. Starting only the Next.js server with `npm run dev` does not start SpotiFLAC. `GET /api/music/health` reports app and service availability separately. `GET /api/music/search`, `POST /api/music/resolve`, `POST /api/music/download`, and `GET /api/music/download/:jobId` provide the app-level API.

The current documented SpotiFLAC REST API provides a durable job queue and status lookup. The app waits for completion server-side with conservative polling; it does not expose download progress or provider cancellation. Without `SPOTIFLAC_CACHE_DIR`, Spotify audio is not available to the player.

## Existing library data

Spotify playlist metadata, ordering, and local library state remain in the app's SQLite store. Existing YouTube playlist import, search, matching, override, lyrics, and downloader functionality remain independent and unchanged. No migration deletes existing playlists, audio files, or database tables.

# YouTube Music sidecar

The application invokes `ytmusic-sidecar.exe` when packaged. During development it falls back to `YTMUSIC_PYTHON services/ytmusic_service.py`.

Electron authentication uses the normal Google `/o/oauth2/v2/auth` browser flow with a loopback redirect and PKCE. The resulting per-user OAuth token is passed to ytmusicapi; the device-code screen is not used by the desktop app.

Build the executable with Python 3.10+ and `services/requirements.txt`, then place it at `services/ytmusic-sidecar.exe` before packaging Electron. The sidecar reads one JSON request from stdin and writes one JSON response to stdout; it never listens on a network port or persists OAuth tokens.

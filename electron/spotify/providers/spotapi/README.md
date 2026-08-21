# Local SpotAPI worker

`worker.py` is a JSON-lines bridge for the Python `spotapi` package. It is
started and stopped by Electron; it does not open an HTTP port.

For development, set `SPOTAPI_PYTHON` to a Python executable with `spotapi`
installed, or install it in `.venv`. For packaged builds, provide a
portable Python runtime with the package installed and set `SPOTAPI_PYTHON`,
or place it at `resources/spotapi-runtime/python.exe`.

Private playlist operations require a SpotAPI browser-cookie session. Music's
`/api/auth/spotify/start` page accepts the session cookies and stores them in
the Electron user-data directory; the worker never receives a raw password
from the UI. SpotAPI's password login also requires a CAPTCHA solver, so the
cookie-session flow is the supported desktop login path.

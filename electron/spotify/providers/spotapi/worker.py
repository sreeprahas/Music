"""Small JSON-lines SpotAPI worker used by the Electron main process.

stdout is reserved for READY and protocol responses. Diagnostics go to stderr.
"""
import importlib
import json
import os
import sys
import traceback

private_login = None
session_path = os.getenv("SPOTAPI_SESSION_FILE") or os.path.join(os.getenv("DATA_DIR", "."), "spotapi-session.json")


class WorkerError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def jsonable(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(key): jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [jsonable(item) for item in value]
    if hasattr(value, "__dict__"):
        return jsonable(vars(value))
    return str(value)


def spotapi():
    try:
        return importlib.import_module("spotapi")
    except ImportError as error:
        raise WorkerError("WORKER_UNAVAILABLE", "The Python package 'spotapi' is not installed.") from error


def config(module):
    return module.Config(logger=module.NoopLogger())


def validate_login(module, login):
    """Validate the session using the profile endpoint.

    SpotAPI's User.verify_login() uses the plan endpoint, which can return an
    HTML/non-JSON response for valid accounts. The profile endpoint is the
    reliable authenticated-session check.
    """
    profile = module.User(login).get_user_info()
    if not isinstance(profile, dict):
        raise WorkerError("AUTH_INVALID", "Spotify returned an invalid profile response.")
    return profile


def load_saved_session(module):
    global private_login
    if not os.path.exists(session_path):
        return
    try:
        with open(session_path, "r", encoding="utf-8") as stream:
            saved = json.load(stream)
        dump = saved[0] if isinstance(saved, list) else saved
        private_login = module.Login.from_cookies(dump, config(module))
        validate_login(module, private_login)
    except Exception as error:
        private_login = None
        print(f"[spotapi-session] Ignoring saved session: {error}", file=sys.stderr)


def require_login():
    if private_login is None or not private_login.logged_in:
        raise WorkerError("AUTH_REQUIRED", "Connect Spotify with a SpotAPI browser session first.")
    return private_login


def login_from_cookies(module, identifier, cookies):
    global private_login
    if not identifier or not isinstance(cookies, dict) or not cookies:
        raise WorkerError("INVALID_SESSION", "A session identifier and Spotify cookies are required.")
    dump = {"identifier": identifier, "password": "", "cookies": cookies}
    try:
        private_login = module.Login.from_cookies(dump, config(module))
        validate_login(module, private_login)
        os.makedirs(os.path.dirname(session_path) or ".", exist_ok=True)
        with open(session_path, "w", encoding="utf-8") as stream:
            json.dump(dump, stream)
        return {"connected": True, "identifier": identifier}
    except Exception as error:
        private_login = None
        raise WorkerError("AUTH_INVALID", f"SpotAPI session could not be loaded: {error}") from error


def instance(module, name):
    value = getattr(module, name, None)
    if value is None:
        raise WorkerError("UNSUPPORTED", f"SpotAPI does not provide {name}.")
    try:
        return value()
    except TypeError as error:
        raise WorkerError("AUTH_REQUIRED", f"SpotAPI authentication is required for {name}.") from error


def call(obj, name, *args, **kwargs):
    method = getattr(obj, name, None)
    if not callable(method):
        raise WorkerError("UNSUPPORTED", f"SpotAPI does not support {name}.")
    try:
        return method(*args, **kwargs)
    except Exception as error:
        raise WorkerError("SPOTIFY_ERROR", str(error)) from error


def dispatch(method, params):
    global private_login
    module = spotapi()
    if method == "auth_status":
        return {"connected": private_login is not None and private_login.logged_in}
    if method == "login_session":
        return login_from_cookies(module, params.get("identifier"), params.get("cookies"))
    if method == "logout":
        private_login = None
        try:
            if os.path.exists(session_path):
                os.remove(session_path)
        except OSError:
            pass
        return {"connected": False}
    if method == "search":
        query = params.get("query", "")
        limit = params.get("limit", 20)
        result = {"tracks": [], "artists": [], "albums": [], "playlists": []}
        requested = [item.strip() for item in str(params.get("types", "track")).split(",")]
        if "track" in requested:
            result["tracks"] = jsonable(call(instance(module, "Song"), "query_songs", query, limit=limit))
        # These optional methods are used when present in a SpotAPI build.
        for kind, cls, method_name in (("artist", "Artist", "query_artists"), ("album", "Album", "query_albums")):
            if kind in requested and getattr(module, cls, None) is not None:
                result[f"{kind}s"] = jsonable(call(instance(module, cls), method_name, query, limit=limit))
        return result

    if method == "get_playlist":
        playlist_type = getattr(module, "PublicPlaylist", None)
        if playlist_type is None:
            raise WorkerError("UNSUPPORTED", "SpotAPI does not provide PublicPlaylist.")
        try:
            return jsonable(playlist_type(params["id"]).get_playlist_info(limit=params.get("limit", 100), offset=params.get("offset", 0)))
        except Exception as error:
            raise WorkerError("SPOTIFY_ERROR", str(error)) from error
    if method == "get_playlist_tracks":
        info = dispatch("get_playlist", params)
        return jsonable(info.get("tracks", info.get("items", [])) if isinstance(info, dict) else [])

    # Private operations use the saved browser-cookie session. Raw passwords
    # are deliberately never accepted from the renderer.
    playlist_type = getattr(module, "PrivatePlaylist", None)
    if playlist_type is None:
        raise WorkerError("UNSUPPORTED", "SpotAPI does not provide PrivatePlaylist.")
    try:
        private = playlist_type(require_login())
    except Exception as error:
        raise WorkerError("AUTH_INVALID", str(error)) from error
    if method == "get_user_playlists":
        return jsonable(call(private, "get_library", params.get("limit", 50)))
    if method == "get_profile":
        return jsonable(validate_login(module, require_login()))
    if method == "create_playlist":
        return jsonable(call(private, "create_playlist", params.get("input", {}).get("name", "Untitled")))
    if method in ("save_playlist", "remove_playlist"):
        private.set_playlist(params["id"])
        return jsonable(call(private, "add_to_library" if method == "save_playlist" else "remove_from_library"))
    raise WorkerError("UNSUPPORTED", f"SpotAPI does not support {method} in this adapter yet.")


def send(message):
    sys.stdout.write(json.dumps(message, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def main():
    # Import once at startup so Electron can distinguish READY from a broken install.
    module = spotapi()
    load_saved_session(module)
    sys.stdout.write("READY\n")
    sys.stdout.flush()
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            request = json.loads(line)
            if request.get("method") == "shutdown":
                send({"id": request.get("id", ""), "success": True, "result": None})
                return
            result = dispatch(request.get("method", ""), request.get("params") or {})
            send({"id": request.get("id", ""), "success": True, "result": result})
        except WorkerError as error:
            send({"id": request.get("id", "") if "request" in locals() else "", "success": False, "error": {"code": error.code, "message": str(error)}})
        except Exception as error:
            print(traceback.format_exc(), file=sys.stderr)
            send({"id": request.get("id", "") if "request" in locals() else "", "success": False, "error": {"code": "SPOTIFY_ERROR", "message": str(error)}})


if __name__ == "__main__":
    try:
        main()
    except WorkerError as error:
        print(f"[{error.code}] {error}", file=sys.stderr)
        sys.exit(1)

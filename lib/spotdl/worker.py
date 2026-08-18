#!/usr/bin/env python3
"""
spotdl metadata worker — a persistent JSON-RPC server over stdin/stdout.

The Node.js bridge (lib/spotdl/bridge.ts) spawns this worker once and reuses
it for all Spotify metadata operations. This avoids re-initializing the
SpotifyClient (~1.7s) and the spotdl import overhead on every call.

Protocol
--------
Each request is a single JSON object on its own line (newline-delimited):
    {"id": "<reqId>", "method": "<method>", "params": {...}}

Each response is a single JSON object on its own line:
    {"id": "<reqId>", "ok": true, "result": <data>}
    {"id": "<reqId>", "ok": false, "error": {"code": "<code>", "message": "<msg>"}}

A fatal initialization error is reported as:
    {"id": null, "ok": false, "error": {"code": "spotdl_init_error", "message": "..."}}
and the worker exits.

Methods
-------
- search_tracks(query, limit) -> {"items": [...], "total": int}
- get_track(url) -> {...}                      # single track metadata
- get_playlist(url) -> {"playlist": {...}, "items": [...]}
- get_album(url) -> {"album": {...}, "items": [...]}
- ping() -> {"pong": true}

All returned shapes are normalized to mirror the Spotify Web API response
shapes the existing application already consumes (see lib/spotify/models.ts),
so the Node adapter layer can feed them straight into normalize.ts.

Security
--------
- No shell is ever invoked. The worker is launched with an argument array.
- Spotify URLs are validated before being passed to spotdl.
- No credentials are printed. Tracebacks are caught and reported as codes.
"""

from __future__ import annotations

import json
import sys
import traceback
from typing import Any, Dict, List, Optional, Tuple

# Force UTF-8 on stdout/stderr. On Windows the default codec is cp1252, which
# cannot encode non-ASCII characters that routinely appear in Spotify metadata
# (track/artist names). Reconfigure before any output is written.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    # Older Python or already-configured stream — fall back to wrapping.
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)

# spotdl imports are deferred until after we can report init errors cleanly,
# but doing them at module load is simpler and the bridge handles a fatal
# init error via the {"id": null} envelope below.
SPOTDL_DEFAULT_CLIENT_ID = "5f573c9620494bae87890c0f08a60293"
SPOTDL_DEFAULT_CLIENT_SECRET = "212476d9b0f3472eaa762d90b19b0ba8"


def _emit(obj: Dict[str, Any]) -> None:
    """Write a single JSON-RPC envelope to stdout and flush."""
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _emit_error(req_id: Optional[str], code: str, message: str) -> None:
    _emit({"id": req_id, "ok": False, "error": {"code": code, "message": message}})


def _is_spotify_url(url: str) -> bool:
    return isinstance(url, str) and "open.spotify.com" in url


def _normalize_image_list(images: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """Coerce spotdl/Spotify image arrays into the SpotifyImage shape."""
    out: List[Dict[str, Any]] = []
    if not isinstance(images, list):
        return out
    for img in images:
        if isinstance(img, dict):
            out.append({
                "url": str(img.get("url", "")),
                "height": img.get("height"),
                "width": img.get("width"),
            })
        elif isinstance(img, str):
            out.append({"url": img, "height": None, "width": None})
    return out


def _track_from_raw(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize a raw Spotify track dict into the app's SpotifyTrack shape."""
    artists = [
        {"id": str(a.get("id", "")), "name": str(a.get("name", "")), "uri": str(a.get("uri", ""))}
        for a in (raw.get("artists") or [])
    ]
    album_raw = raw.get("album") or {}
    album = {
        "id": str(album_raw.get("id", "")),
        "name": str(album_raw.get("name", "")),
        "album_type": album_raw.get("album_type"),
        "release_date": album_raw.get("release_date"),
        "images": _normalize_image_list(album_raw.get("images")),
        "artists": [
            {"id": str(a.get("id", "")), "name": str(a.get("name", "")), "uri": str(a.get("uri", ""))}
            for a in (album_raw.get("artists") or [])
        ],
        "uri": str(album_raw.get("uri", "")),
    }
    external_ids = raw.get("external_ids") or {}
    return {
        "id": str(raw.get("id", "")),
        "name": str(raw.get("name", "")),
        "uri": str(raw.get("uri") or ("spotify:track:" + str(raw.get("id", "")))),
        "duration_ms": int(raw.get("duration_ms") or 0),
        "explicit": bool(raw.get("explicit", False)),
        "artists": artists,
        "album": album,
        "preview_url": raw.get("preview_url"),
        "external_ids": {"isrc": external_ids.get("isrc")} if external_ids.get("isrc") else {},
    }


def _playlist_item_from_raw(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize a raw playlist track entry into SpotifyPlaylistItem shape."""
    track = raw.get("track")
    return {
        "added_at": raw.get("added_at"),
        "added_by": raw.get("added_by"),
        "is_local": bool(raw.get("is_local", False)),
        "track": _track_from_raw(track) if isinstance(track, dict) else None,
    }


# ---------------------------------------------------------------------------
# SpotifyClient initialization
# ---------------------------------------------------------------------------

_client = None  # type: Optional[Any]


def _init_client() -> None:
    global _client
    from spotdl.utils.spotify import SpotifyClient  # type: ignore

    SpotifyClient.init(
        client_id=SPOTDL_DEFAULT_CLIENT_ID,
        client_secret=SPOTDL_DEFAULT_CLIENT_SECRET,
        user_auth=False,
        no_cache=False,  # enable spotdl's own metadata cache to speed repeats
        headless=True,
        max_retries=3,
    )
    _client = SpotifyClient()


# ---------------------------------------------------------------------------
# Request handlers
# ---------------------------------------------------------------------------

def _handle_search_tracks(params: Dict[str, Any]) -> Dict[str, Any]:
    query = str(params.get("query", "")).strip()
    limit = int(params.get("limit", 20))
    if not query:
        return {"items": [], "total": 0}
    raw = _client.search(query, limit=limit)
    if raw is None:
        return {"items": [], "total": 0}
    tracks_block = raw.get("tracks") or {}
    items = tracks_block.get("items") or []
    return {
        "items": [_track_from_raw(t) for t in items if isinstance(t, dict)],
        "total": int(tracks_block.get("total", len(items))),
    }


def _handle_get_track(params: Dict[str, Any]) -> Dict[str, Any]:
    url = str(params.get("url", ""))
    if not _is_spotify_url(url) or "/track/" not in url:
        raise ValueError("Not a Spotify track URL")
    raw = _client.track(url)
    if raw is None:
        raise RuntimeError("Spotify returned no metadata for track")
    return _track_from_raw(raw)


def _handle_get_playlist(params: Dict[str, Any]) -> Dict[str, Any]:
    url = str(params.get("url", ""))
    if not _is_spotify_url(url) or "/playlist/" not in url:
        raise ValueError("Not a Spotify playlist URL")
    from spotdl.types.playlist import Playlist  # type: ignore

    metadata, songs = Playlist.get_metadata(url)
    # metadata is a dict with: name, url, description, author_url, author_name, cover_url
    cover_url = metadata.get("cover_url") if isinstance(metadata, dict) else None
    playlist = {
        "id": _id_from_url(url, "playlist"),
        "name": str(metadata.get("name", "")) if isinstance(metadata, dict) else "",
        "description": str(metadata.get("description", "")) or "" if isinstance(metadata, dict) else "",
        "owner": {
            "id": _id_from_url(metadata.get("author_url", ""), "user") if isinstance(metadata, dict) else "",
            "display_name": metadata.get("author_name") if isinstance(metadata, dict) else None,
            "uri": metadata.get("author_url") if isinstance(metadata, dict) else None,
        },
        "images": _normalize_image_list([{"url": cover_url}] if cover_url else None),
        "tracks": {"href": url, "total": len(songs)},
        "uri": "spotify:playlist:" + _id_from_url(url, "playlist"),
    }
    items: List[Dict[str, Any]] = []
    for idx, song in enumerate(songs):
        items.append({
            "added_at": None,
            "added_by": None,
            "is_local": False,
            "track": _song_to_track_dict(song, idx),
        })
    return {"playlist": playlist, "items": items}


def _handle_get_album(params: Dict[str, Any]) -> Dict[str, Any]:
    url = str(params.get("url", ""))
    if not _is_spotify_url(url) or "/album/" not in url:
        raise ValueError("Not a Spotify album URL")
    from spotdl.types.album import Album  # type: ignore

    metadata, songs = Album.get_metadata(url)
    album_id = _id_from_url(url, "album")
    cover_url = metadata.get("cover_url") if isinstance(metadata, dict) else None
    album = {
        "id": album_id,
        "name": str(metadata.get("name", "")) if isinstance(metadata, dict) else "",
        "album_type": metadata.get("album_type") if isinstance(metadata, dict) else None,
        "release_date": metadata.get("release_date") if isinstance(metadata, dict) else None,
        "images": _normalize_image_list([{"url": cover_url}] if cover_url else None),
        "artists": [
            {"id": "", "name": str(metadata.get("artist", "")), "uri": ""}
        ] if isinstance(metadata, dict) and metadata.get("artist") else [],
        "uri": "spotify:album:" + album_id,
    }
    items: List[Dict[str, Any]] = []
    for idx, song in enumerate(songs):
        items.append({
            "added_at": None,
            "added_by": None,
            "is_local": False,
            "track": _song_to_track_dict(song, idx),
        })
    return {"album": album, "items": items}


def _handle_ping(_params: Dict[str, Any]) -> Dict[str, Any]:
    return {"pong": True}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _id_from_url(url: str, kind: str) -> str:
    """Extract the trailing id from a Spotify URL of the given kind."""
    if not isinstance(url, str):
        return ""
    marker = "/" + kind + "/"
    idx = url.find(marker)
    if idx < 0:
        return ""
    tail = url[idx + len(marker):]
    # strip query/fragment
    for sep in ("?", "#"):
        if sep in tail:
            tail = tail.split(sep, 1)[0]
    return tail


def _song_to_track_dict(song: Any, position: int) -> Dict[str, Any]:
    """Convert a spotdl Song object into the app's SpotifyTrack shape."""
    artists = []
    artist_names = getattr(song, "artists", None) or []
    primary = getattr(song, "artist", "") or ""
    if artist_names:
        for n in artist_names:
            artists.append({"id": "", "name": str(n), "uri": ""})
    elif primary:
        artists.append({"id": "", "name": str(primary), "uri": ""})

    album = {
        "id": str(getattr(song, "album_id", "") or ""),
        "name": str(getattr(song, "album_name", "") or ""),
        "album_type": getattr(song, "album_type", None),
        "release_date": str(getattr(song, "date", "") or "") or None,
        "images": _normalize_image_list([{"url": getattr(song, "cover_url", None)}] if getattr(song, "cover_url", None) else None),
        "artists": [{"id": "", "name": str(getattr(song, "album_artist", "") or primary), "uri": ""}] if (getattr(song, "album_artist", None) or primary) else [],
        "uri": "spotify:album:" + str(getattr(song, "album_id", "") or "") if getattr(song, "album_id", None) else "",
    }
    duration_ms = int(getattr(song, "duration", 0) or 0) * 1000
    song_id = str(getattr(song, "song_id", "") or "")
    return {
        "id": song_id,
        "name": str(getattr(song, "name", "") or ""),
        "uri": "spotify:track:" + song_id if song_id else "",
        "duration_ms": duration_ms,
        "explicit": bool(getattr(song, "explicit", False)),
        "artists": artists,
        "album": album,
        "preview_url": None,
        "external_ids": {"isrc": str(getattr(song, "isrc", "") or "")} if getattr(song, "isrc", None) else {},
    }


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

_HANDLERS = {
    "ping": _handle_ping,
    "search_tracks": _handle_search_tracks,
    "get_track": _handle_get_track,
    "get_playlist": _handle_get_playlist,
    "get_album": _handle_get_album,
}


def main() -> int:
    # Initialize the SpotifyClient up front so a fatal error is reported once.
    try:
        _init_client()
    except Exception as exc:  # pragma: no cover - reported via envelope
        _emit_error(None, "spotdl_init_error", f"Failed to initialize spotdl: {exc}")
        return 1

    # Signal readiness.
    _emit({"id": None, "ok": True, "result": {"ready": True}})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as exc:
            _emit_error(None, "spotdl_bad_request", f"Invalid JSON: {exc}")
            continue
        req_id = req.get("id")
        method = req.get("method")
        params = req.get("params") or {}
        handler = _HANDLERS.get(method) if isinstance(method, str) else None
        if handler is None:
            _emit_error(req_id, "spotdl_unknown_method", f"Unknown method: {method}")
            continue
        try:
            result = handler(params)
            _emit({"id": req_id, "ok": True, "result": result})
        except Exception as exc:
            # Never leak raw tracebacks to the caller; the bridge maps codes.
            code = "spotdl_runtime_error"
            msg = str(exc) or exc.__class__.__name__
            # Classify common Spotify errors.
            lower = msg.lower()
            if "not found" in lower or "404" in lower:
                code = "spotify_not_found"
            elif "rate" in lower and "limit" in lower:
                code = "spotify_rate_limit"
            elif "invalid" in lower and "url" in lower:
                code = "spotify_invalid_url"
            elif "network" in lower or "timeout" in lower or "timed out" in lower:
                code = "spotify_network"
            _emit_error(req_id, code, msg)
    return 0


if __name__ == "__main__":
    sys.exit(main())

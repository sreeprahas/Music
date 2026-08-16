#!/usr/bin/env python3
"""Small JSON-lines sidecar for ytmusicapi.

The parent process owns sessions and never exposes this process to the network.
Each request contains one user's OAuth token and client credentials; no token is
written by this service.
"""
from __future__ import annotations

import json
import sys
from typing import Any

from ytmusicapi import OAuthCredentials, YTMusic


def values_with_key(value: Any, key: str) -> list[Any]:
    found: list[Any] = []
    if isinstance(value, dict):
        for name, child in value.items():
            if name == key:
                found.append(child)
            found.extend(values_with_key(child, key))
    elif isinstance(value, list):
        for child in value:
            found.extend(values_with_key(child, key))
    return found


def renderer_playlists(response: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for renderer in values_with_key(response, "musicTwoRowItemRenderer"):
        title = (((renderer.get("title") or {}).get("runs") or [{}])[0].get("text") or "").strip()
        endpoint = (((renderer.get("navigationEndpoint") or {}).get("browseEndpoint")) or {})
        raw_id = endpoint.get("browseId") or ""
        playlist_id = raw_id[2:] if raw_id.startswith("VL") else raw_id
        if not title or not playlist_id or playlist_id.startswith("FE"):
            continue
        thumbnail = (((renderer.get("thumbnailRenderer") or {}).get("musicThumbnailRenderer") or {}).get("thumbnail") or {}).get("thumbnails") or []
        subtitle = "".join(run.get("text", "") for run in ((renderer.get("subtitle") or {}).get("runs") or []))
        rows.append({"playlistId": playlist_id, "title": title, "description": subtitle, "thumbnails": thumbnail, "count": 0})
    return rows


def client(request: dict[str, Any]) -> YTMusic:
    oauth = request["oauth"]
    token = request["token"]
    auth = {
        "scope": token.get("scope", "https://www.googleapis.com/auth/youtube"),
        "token_type": token.get("token_type", "Bearer"),
        "access_token": token["access_token"],
        "refresh_token": token["refresh_token"],
        "expires_at": int(token.get("expires_at", 0)),
        "expires_in": int(token.get("expires_in", 0)),
    }
    return YTMusic(
        auth=auth,
        oauth_credentials=OAuthCredentials(
            client_id=oauth["client_id"],
            client_secret=oauth["client_secret"],
        ),
    )


def track(item: dict[str, Any], position: int) -> dict[str, Any] | None:
    video_id = item.get("videoId") or item.get("videoId")
    if not video_id:
        return None
    artists = item.get("artists") or []
    artist = ", ".join(str(a.get("name", "")) for a in artists if a.get("name"))
    thumbs = item.get("thumbnails") or []
    return {
        "videoId": video_id,
        "playlistItemId": item.get("setVideoId") or item.get("feedbackToken"),
        "title": item.get("title") or "Unknown title",
        "artist": artist or "Unknown Artist",
        "thumbnailUrl": (thumbs[-1].get("url") if thumbs else "") or "",
        "duration": int(item.get("length_seconds") or item.get("duration_seconds") or 0),
        "position": position,
        "dateAdded": item.get("dateAdded"),
    }


def execute(request: dict[str, Any]) -> dict[str, Any]:
    action = request["action"]
    if action == "oauth_code":
        credentials = OAuthCredentials(**request["oauth"])
        return {"code": credentials.get_code()}
    if action == "oauth_token":
        credentials = OAuthCredentials(**request["oauth"])
        return {"token": credentials.token_from_code(request["device_code"])}

    yt = client(request)
    if action == "account_info":
        return {"account": yt.get_account_info()}
    if action == "playlists":
        # ytmusicapi's public helper currently browses the saved-playlists
        # shelf. Include the privately-owned shelf as well so user-created
        # playlists are not omitted from the library.
        rows = []
        parser_globals = YTMusic.get_library_playlists.__globals__
        get_library_contents = parser_globals["get_library_contents"]
        parse_content_list = parser_globals["parse_content_list"]
        parse_playlist = parser_globals["parse_playlist"]
        for browse_id in ("FEmusic_library_privately_owned_playlists", "FEmusic_liked_playlists"):
            # YouTube Music sometimes rejects one of these library shelves with
            # HTTP 400 even though the account and OAuth token are valid. Keep
            # trying the other shelf instead of failing the whole playlist call.
            try:
                before = len(rows)
                response = yt._send_request("browse", {"browseId": browse_id})
                contents = get_library_contents(response, ["gridRenderer"])
                if contents:
                    rows.extend(parse_content_list(contents.get("items", [])[1:], parse_playlist))
                if not contents or len(rows) == before:
                    rows.extend(renderer_playlists(response))
            except Exception:
                continue

        # Keep the public parser as a final compatibility fallback when the
        # shelf layout changes between YouTube Music backend versions.
        if not rows:
            raise RuntimeError("ytmusicapi OAuth library request returned no playlists")
        unique = {}
        for row in rows:
            if row.get("playlistId"):
                unique[row["playlistId"]] = row
        rows = list(unique.values())
        return {"playlists": [{
            "id": row.get("playlistId"),
            "title": row.get("title") or "Untitled playlist",
            "description": row.get("description") or "",
            "thumbnailUrl": (row.get("thumbnails") or [{}])[-1].get("url", ""),
            "trackCount": int(row.get("count") or 0),
        } for row in rows if row.get("playlistId")]}
    if action == "playlist":
        if request["playlist_id"] in ("LL", "LM"):
            try:
                data = yt.get_liked_songs(limit=10000)
            except Exception:
                # The LM/VLL liked-playlist browse endpoint is intermittently
                # rejected with HTTP 400. The library endpoint is the same
                # ytmusicapi service and provides the saved-song collection
                # without relying on that synthetic playlist id.
                data = {"id": "LL", "title": "Liked Songs", "tracks": yt.get_library_songs(limit=10000)}
        else:
            data = yt.get_playlist(request["playlist_id"], limit=None)
        tracks = [track(item, i) for i, item in enumerate(data.get("tracks") or [])]
        return {"playlist": data, "tracks": [item for item in tracks if item]}
    if action == "create":
        return {"playlist_id": yt.create_playlist(request["title"], request.get("description", ""), "PRIVATE")}
    if action == "edit":
        return {"result": yt.edit_playlist(request["playlist_id"], title=request.get("title"), description=request.get("description"))}
    if action == "delete":
        return {"result": yt.delete_playlist(request["playlist_id"])}
    if action == "add":
        return {"result": yt.add_playlist_items(request["playlist_id"], [request["video_id"]], duplicates=False)}
    if action == "remove":
        data = yt.get_playlist(request["playlist_id"], limit=None)
        ids = [item.get("setVideoId") for item in data.get("tracks") or []
               if item.get("videoId") == request.get("video_id") and item.get("setVideoId")]
        if request.get("playlist_item_id"):
            ids = [request["playlist_item_id"]]
        return {"result": yt.remove_playlist_items(request["playlist_id"], [{"videoId": request.get("video_id"), "setVideoId": item} for item in ids])}
    if action == "reorder":
        playlist_id = request["playlist_id"]
        desired = request["video_ids"]
        data = yt.get_playlist(playlist_id, limit=None)
        current = [item.get("videoId") for item in data.get("tracks") or []]
        moves = 0
        for target_index, video_id in enumerate(desired):
            try:
                current_index = current.index(video_id)
            except ValueError:
                continue
            if current_index == target_index:
                continue
            anchor = current[target_index] if target_index < len(current) else None
            if anchor:
                yt.edit_playlist(playlist_id, moveItem=(video_id, anchor))
                current.pop(current_index)
                current.insert(target_index, video_id)
                moves += 1
        return {"updatedCount": moves}
    raise ValueError(f"Unsupported action: {action}")


for line in sys.stdin:
    try:
        request = json.loads(line)
        print(json.dumps({"ok": True, "result": execute(request)}), flush=True)
    except Exception as exc:  # errors are returned without credentials
        print(json.dumps({"ok": False, "error": str(exc)[:500], "type": type(exc).__name__}), flush=True)

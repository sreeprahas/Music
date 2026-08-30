'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { Playlist, Track } from '@/types';
import { Search, Circle, CheckCircle2 } from 'lucide-react';
import { PlaylistArtwork } from './PlaylistArtwork';

const membershipCache = new Map<string, Set<string>>();

export function getCachedPlaylistMemberships(videoId: string): Set<string> {
  return new Set(membershipCache.get(videoId) ?? []);
}

export function primePlaylistMemberships(videoId: string, playlistIds: Iterable<string>) {
  membershipCache.set(videoId, new Set(playlistIds));
}

export function removePlaylistMembership(videoId: string, playlistId: string) {
  const memberships = membershipCache.get(videoId);
  if (!memberships) return;
  const next = new Set(memberships);
  next.delete(playlistId);
  membershipCache.set(videoId, next);
}

interface Props {
  track: Track;
  playlists: Playlist[];
  /** Set of playlist IDs the track is currently in (may include extra beyond playlistId) */
  checkedIds?: string[];
  onAdd: (track: Track, playlistId: string) => void;
  onRemove: (track: Track, playlistId: string) => void;
  onClose: () => void;
  /** Position anchor — the popover will appear above/below this ref element */
  anchorRef?: React.RefObject<HTMLElement | null>;
  /** Fixed position override (for context-menu usage) */
  style?: React.CSSProperties;
  className?: string;
  /** Optional map of playlistId → first-N tracks used to build the dynamic 2×2 cover. */
  tracksByPlaylist?: Record<string, Track[]>;
}

export function AddToPlaylistDropdown({
  track,
  playlists,
  checkedIds,
  onAdd,
  tracksByPlaylist,
  onRemove,
  onClose,
  anchorRef,
  style,
  className = '',
}: Props) {
  const [search, setSearch] = useState('');
  const trackKey = track.videoId || track.sourceTrackId || `${track.title}\u0000${track.artist}`;
  // Local checked state — initialised from track.playlistId + optional checkedIds prop
  const initChecked = (): Set<string> => {
    const s = new Set<string>();
    getCachedPlaylistMemberships(trackKey).forEach((id) => s.add(id));
    if (track.playlistId) s.add(track.playlistId);
    checkedIds?.forEach((id) => s.add(id));
    return s;
  };
  const [localChecked, setLocalChecked] = useState<Set<string>>(initChecked);
  const [initialChecked, setInitialChecked] = useState<Set<string>>(initChecked);
  const containerRef = useRef<HTMLDivElement>(null);
  const checkedKey = checkedIds?.join(',') ?? '';
  const hasPendingChangesRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/playlist/memberships?videoId=${encodeURIComponent(track.videoId)}&sourceTrackId=${encodeURIComponent(track.sourceTrackId || '')}`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled || hasPendingChangesRef.current || !Array.isArray(data?.playlistIds)) return;
        const next = new Set<string>(data.playlistIds);
        if (track.playlistId) next.add(track.playlistId);
        checkedKey.split(',').filter(Boolean).forEach((id) => next.add(id));
        primePlaylistMemberships(trackKey, next);
        setInitialChecked(next);
        setLocalChecked(next);
      })
      .catch(() => { });
    return () => { cancelled = true; };
  }, [checkedKey, track.playlistId, track.videoId, track.sourceTrackId, trackKey]);

  // Close on outside click / Escape
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const clickedPopover = containerRef.current?.contains(target);
      const clickedAnchor = anchorRef?.current?.contains(target);
      if (!clickedPopover && !clickedAnchor) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [anchorRef, onClose]);

  const filtered = playlists.filter((pl) =>
    pl.title.toLowerCase().includes(search.toLowerCase())
  );
  const recentIds = new Set(playlists.slice(0, 5).map((pl) => pl.id));
  const orderedPlaylists = [...filtered].sort((a, b) => {
    const recentDifference = Number(recentIds.has(b.id)) - Number(recentIds.has(a.id));
    return recentDifference || a.title.localeCompare(b.title);
  });

  const toggle = (pl: Playlist) => {
    hasPendingChangesRef.current = true;
    const was = localChecked.has(pl.id);
    setLocalChecked((prev) => {
      const next = new Set(prev);
      if (was) next.delete(pl.id); else next.add(pl.id);
      return next;
    });
  };

  const hasChanges = [...localChecked].some((id) => !initialChecked.has(id)) ||
    [...initialChecked].some((id) => !localChecked.has(id));

  const commitChanges = () => {
    const committed = new Set(localChecked);
    primePlaylistMemberships(trackKey, committed);
    playlists.forEach((playlist) => {
      const wasChecked = initialChecked.has(playlist.id);
      const isChecked = localChecked.has(playlist.id);
      if (wasChecked === isChecked) return;
      if (isChecked) onAdd(track, playlist.id);
      else onRemove(track, playlist.id);
    });
    onClose();
  };

  return (
    <div
      ref={containerRef}
      style={style}
      className={`z-[200] w-[280px] rounded-2xl border border-border bg-surface shadow-xl shadow-shadow/60 flex flex-col overflow-hidden ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <p className="text-[13px] font-bold text-text mb-3">Add to playlist</p>
        {/* Search */}
        <div className="flex items-center gap-2 rounded-lg bg-surface-hover border border-border px-2.5 py-1.5">
          <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a playlist"
            className="flex-1 bg-transparent text-xs text-text placeholder:text-text-disabled outline-none border-none"
          />
        </div>
      </div>

      {/* Playlist list */}
      <div className="flex-1 overflow-y-auto min-h-0 max-h-[260px] px-1 pb-1">
        {orderedPlaylists.length === 0 ? (
          <p className="px-4 py-3 text-xs text-text-muted italic">No playlists found</p>
        ) : (
          orderedPlaylists.map((pl) => {
            const isChecked = localChecked.has(pl.id);
            return (
              <button
                key={pl.id}
                onClick={() => toggle(pl)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                  isChecked ? 'bg-surface-hover hover:bg-surface-active' : 'hover:bg-surface-hover'
                }`}
              >
                {/* Thumbnail */}
                <div className="w-9 h-9 rounded-lg overflow-hidden bg-surface shrink-0 border border-border-subtle">
                  <PlaylistArtwork playlist={pl} tracks={tracksByPlaylist?.[pl.id]} />
                </div>

                {/* Title */}
                <span className={`flex-1 min-w-0 text-sm truncate ${isChecked ? 'text-text font-medium' : 'text-text-secondary'}`}>
                  {pl.title}
                </span>

                {/* Check icon — filled green circle when checked, outlined circle with + when not */}
                <div className="shrink-0 flex items-center justify-center w-5 h-5">
                  {isChecked ? (
                    <CheckCircle2 className="w-5 h-5 text-accent" strokeWidth={2.5} />
                  ) : (
                    <Circle className="w-5 h-5 text-text-disabled" strokeWidth={1.5} />
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 flex items-center justify-end gap-2 px-3 py-2.5 border-t border-border">
        <button
          onClick={hasChanges ? commitChanges : onClose}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold text-text-secondary hover:text-text hover:bg-surface-hover transition-colors"
        >
          {hasChanges ? 'Done' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { Playlist, Track } from '@/types';
import { Search, Circle, CheckCircle2 } from 'lucide-react';

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
  isOffline?: boolean;
}

export function AddToPlaylistDropdown({
  track,
  playlists,
  checkedIds,
  onAdd,
  onRemove,
  onClose,
  anchorRef,
  style,
  className = '',
  isOffline = false,
}: Props) {
  const [search, setSearch] = useState('');
  // Local checked state — initialised from track.playlistId + optional checkedIds prop
  const initChecked = (): Set<string> => {
    const s = new Set<string>();
    getCachedPlaylistMemberships(track.videoId).forEach((id) => s.add(id));
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
    fetch(`/api/playlist/memberships?videoId=${encodeURIComponent(track.videoId)}`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled || hasPendingChangesRef.current || !Array.isArray(data?.playlistIds)) return;
        const next = new Set<string>(data.playlistIds);
        if (track.playlistId) next.add(track.playlistId);
        checkedKey.split(',').filter(Boolean).forEach((id) => next.add(id));
        primePlaylistMemberships(track.videoId, next);
        setInitialChecked(next);
        setLocalChecked(next);
      })
      .catch(() => { })
    return () => { cancelled = true; };
  }, [checkedKey, track.playlistId, track.videoId]);

  // Close on outside click / Escape
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const filtered = playlists.filter((pl) =>
    pl.title.toLowerCase().includes(search.toLowerCase())
  );
  const recentIds = new Set(playlists.slice(0, 5).map((pl) => pl.id));
  const orderedPlaylists = [...filtered].sort((a, b) => {
    const recentDifference = Number(recentIds.has(b.id)) - Number(recentIds.has(a.id));
    return recentDifference || a.title.localeCompare(b.title);
  });

  const toggle = (pl: Playlist) => {
    if (isOffline) return;
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
    primePlaylistMemberships(track.videoId, committed);
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
      className={`z-[200] w-[280px] rounded-2xl border border-white/[0.10] bg-[#1a1a1a] shadow-2xl shadow-black/70 backdrop-blur-xl flex flex-col overflow-hidden ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <p className="text-[13px] font-bold text-white mb-3">Add to playlist</p>
        {/* Search */}
        <div className="flex items-center gap-2 rounded-lg bg-white/[0.07] border border-white/[0.08] px-2.5 py-1.5">
          <Search className="w-3.5 h-3.5 text-white/40 shrink-0" />
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a playlist"
            className="flex-1 bg-transparent text-xs text-white placeholder:text-white/30 outline-none border-none"
          />
        </div>
      </div>

      {/* Playlist list */}
      <div className="flex-1 overflow-y-auto min-h-0 max-h-[260px] px-1 pb-1">
        {orderedPlaylists.length === 0 ? (
          <p className="px-4 py-3 text-xs text-white/40 italic">No playlists found</p>
        ) : (
          orderedPlaylists.map((pl) => {
            const isChecked = localChecked.has(pl.id);
            return (
              <button
                key={pl.id}
                onClick={() => toggle(pl)}
                disabled={isOffline}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                  isChecked ? 'bg-white/[0.06] hover:bg-white/[0.09]' : 'hover:bg-white/[0.06]'
                } ${isOffline ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                {/* Thumbnail */}
                <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/5 shrink-0 border border-white/[0.06]">
                  {pl.thumbnailUrl ? (
                    <img
                      src={`/api/playlist-thumbnail?playlistId=${encodeURIComponent(pl.id)}&url=${encodeURIComponent(pl.thumbnailUrl)}`}
                      alt={pl.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-white/5">
                      <span className="text-[10px] text-white/30">♪</span>
                    </div>
                  )}
                </div>

                {/* Title */}
                <span className={`flex-1 min-w-0 text-sm truncate ${isChecked ? 'text-white font-medium' : 'text-white/70'}`}>
                  {pl.title}
                </span>

                {/* Check icon — filled green circle (image 1) when checked, outlined circle with + (image 2) when not */}
                <div className="shrink-0 flex items-center justify-center w-5 h-5">
                  {isChecked ? (
                    <CheckCircle2 className="w-5 h-5 text-[#00F2FE]" strokeWidth={2.5} />
                  ) : (
                    <Circle className="w-5 h-5 text-white/30" strokeWidth={1.5} />
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 flex items-center justify-end gap-2 px-3 py-2.5 border-t border-white/[0.08]">
        <button
          onClick={hasChanges && !isOffline ? commitChanges : onClose}
          disabled={isOffline && hasChanges}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          {hasChanges && !isOffline ? 'Done' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}

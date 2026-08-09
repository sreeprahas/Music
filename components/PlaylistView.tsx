'use client';

import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import type { Playlist, Track } from '@/types';
import { formatDuration, cleanArtistName } from '@/lib/ytmusicApi';
import { Pin, Eye, EyeOff, Play, Download, Music, Search, X, MoreVertical, GripVertical, ArrowUpDown, Check } from 'lucide-react';
import { SongContextMenu } from './SongContextMenu';
import { Skeleton } from './Skeleton';

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks <= 4) return diffWeeks === 1 ? '1 week ago' : `${diffWeeks} weeks ago`;
  return date.toLocaleDateString();
}

export function PlaylistViewSkeleton() {
  return (
    <div className="h-full w-full min-w-0 flex flex-col min-h-0 overflow-hidden">
      {/* Header skeleton */}
      <div className="px-6 pt-6 pb-4 shrink-0 flex items-center gap-4">
        <Skeleton className="w-28 h-28 rounded-2xl shrink-0" />
        <div className="flex-1 space-y-2.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3 w-24" />
          <div className="flex gap-2 mt-3">
            <Skeleton className="h-8 w-20 rounded-2xl" />
            <Skeleton className="h-8 w-28 rounded-2xl" />
            <Skeleton className="h-8 w-16 rounded-2xl" />
          </div>
        </div>
      </div>
      {/* Song rows skeleton */}
      <div className="px-6 flex-1 overflow-hidden">
        <div className="border-b border-white/5 pb-3 mb-1 flex gap-3 px-3">
          <Skeleton className="h-3 w-5" />
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="space-y-1 pt-2">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex items-center gap-4 px-3 py-2.5">
              <Skeleton className="h-4 w-5 shrink-0" />
              <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5" style={{ width: `${40 + (i % 3) * 12}%` }} />
                <Skeleton className="h-2.5" style={{ width: `${20 + (i % 4) * 8}%` }} />
              </div>
              <Skeleton className="h-3 w-14 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface Props {
  playlist: Playlist;
  isPinned: boolean;
  isHidden?: boolean;
  onPlay: (track: Track, queue: Track[]) => void;
  onAddToQueue?: (track: Track) => void;
  onPlayNext?: (track: Track) => void;
  onAddToPlaylist?: (track: Track, playlistId: string) => void;
  onRemoveFromPlaylist?: (track: Track, playlistId: string) => void;
  onSetSleepTimer?: (minutes: number) => void;
  onOpenSleepTimer?: () => void;
  playlists?: Playlist[];
  onDownload: (playlistId: string) => void;
  onDownloadTrack?: (track: Track) => void;
  onDeleteTrack?: (track: Track) => void;
  onTrackDeleted?: (videoId: string) => void;
  onTogglePin: (playlistId: string) => void;
  onToggleHidden: (playlistId: string) => void;
  onTracksLoaded?: (playlist: Playlist, tracks: Track[]) => void;
  lastDownloadedTrack?: { videoId: string; timestamp: number } | null;
  restoredTrack?: { track: Track; playlistId: string; timestamp: number } | null;
  currentVideoId?: string;
  activePlaylistId?: string | null;
}

export function PlaylistView({
  playlist,
  isPinned,
  isHidden = false,
  onPlay,
  onAddToQueue,
  onPlayNext,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onSetSleepTimer,
  onOpenSleepTimer,
  playlists = [],
  onDownload,
  onDownloadTrack,
  onDeleteTrack,
  onTrackDeleted,
  onTogglePin,
  onToggleHidden,
  onTracksLoaded,
  lastDownloadedTrack,
  restoredTrack,
  currentVideoId,
  activePlaylistId,
}: Props) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trackSearchQuery, setTrackSearchQuery] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ track: Track; x: number; y: number } | null>(null);
  // Track which videoIds are currently being downloaded (spinner shown)
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const trackListRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onTracksLoaded);
  callbackRef.current = onTracksLoaded;

  // Edit Order (Spotify-style drag mode)
  const [isEditOrder, setIsEditOrder] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [hasReordered, setHasReordered] = useState(false);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, idx: number, videoId: string) => {
    dragIndexRef.current = idx;
    setDraggingId(videoId);
    e.dataTransfer.effectAllowed = 'move';
    // Transparent drag ghost
    const ghost = document.createElement('div');
    ghost.style.position = 'absolute';
    ghost.style.top = '-9999px';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(idx);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    const fromIdx = dragIndexRef.current;
    if (fromIdx === null || fromIdx === dropIdx) {
      setDragOverIndex(null);
      setDraggingId(null);
      dragIndexRef.current = null;
      return;
    }
    setTracks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(dropIdx, 0, moved);
      return next;
    });
    setHasReordered(true);
    dragIndexRef.current = null;
    setDragOverIndex(null);
    setDraggingId(null);
  }, []);

  const handleToggleEditOrder = useCallback(() => {
    if (isEditOrder) {
      // Exiting edit mode ("Done" clicked)
      setIsEditOrder(false);
      if (hasReordered) {
        setIsSavingOrder(true);
        const videoIds = tracks.map((t) => t.videoId);
        fetch('/api/playlist/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playlistId: playlist.id, videoIds }),
        })
          .catch((e) => console.error('Failed to sync reordered playlist with YouTube:', e))
          .finally(() => {
            setIsSavingOrder(false);
            setHasReordered(false);
          });
      }
    } else {
      setIsEditOrder(true);
      setHasReordered(false);
    }
  }, [isEditOrder, hasReordered, playlist.id, tracks]);

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
    setDraggingId(null);
  }, []);

  // Local wrapper: shows spinner, calls parent handler, updates track state optimistically
  const handleDownloadTrack = useCallback(async (track: Track) => {
    if (!onDownloadTrack) return;
    setDownloadingIds((prev) => new Set([...prev, track.videoId]));
    await onDownloadTrack(track);
    setDownloadingIds((prev) => { const n = new Set(prev); n.delete(track.videoId); return n; });
    // Mark track as downloaded in local state (no page reload)
    setTracks((prev) => prev.map((t) => t.videoId === track.videoId ? { ...t, downloaded: true } : t));
  }, [onDownloadTrack]);

  // Local wrapper: shows spinner, calls parent handler, updates track state optimistically
  const handleDeleteTrack = useCallback(async (track: Track) => {
    if (!onDeleteTrack) return;
    setDownloadingIds((prev) => new Set([...prev, track.videoId]));
    await onDeleteTrack(track);
    setDownloadingIds((prev) => { const n = new Set(prev); n.delete(track.videoId); return n; });
    // Mark track as not downloaded in local state (no page reload)
    setTracks((prev) => prev.map((t) => t.videoId === track.videoId ? { ...t, downloaded: false } : t));
    // Notify parent so the player can be stopped if the track was playing
    onTrackDeleted?.(track.videoId);
  }, [onDeleteTrack, onTrackDeleted]);

  // Remember original index of removed track so we can restore it to the same position
  const removedTrackIndexRef = useRef<Map<string, number>>(new Map());

  // Local wrapper for track removal: remove from UI immediately
  const handleRemoveTrackLocal = useCallback((track: Track, targetPlaylistId: string) => {
    if (onRemoveFromPlaylist) {
      setTracks((prev) => {
        const idx = prev.findIndex((t) => t.videoId === track.videoId);
        if (idx !== -1) removedTrackIndexRef.current.set(track.videoId, idx);
        return prev.filter((t) => t.videoId !== track.videoId);
      });
      onRemoveFromPlaylist(track, targetPlaylistId);
    }
  }, [onRemoveFromPlaylist]);

  // Real-time track download updates: remove spinner and mark track as downloaded
  useEffect(() => {
    if (!lastDownloadedTrack) return;
    const { videoId } = lastDownloadedTrack;
    setDownloadingIds((prev) => {
      const next = new Set(prev);
      next.delete(videoId);
      return next;
    });
    setTracks((prev) => prev.map((t) => (t.videoId === videoId ? { ...t, downloaded: true } : t)));
  }, [lastDownloadedTrack]);

  // Real-time track undo restoration: re-insert track at original position immediately
  useEffect(() => {
    if (!restoredTrack || restoredTrack.playlistId !== playlist.id) return;
    const restored = restoredTrack.track;
    setTracks((prev) => {
      if (prev.some((t) => t.videoId === restored.videoId)) return prev;
      const originalIdx = removedTrackIndexRef.current.get(restored.videoId);
      removedTrackIndexRef.current.delete(restored.videoId);
      const next = [...prev];
      const insertAt = originalIdx !== undefined ? Math.min(originalIdx, next.length) : next.length;
      next.splice(insertAt, 0, restored);
      return next;
    });
  }, [restoredTrack, playlist.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    const load = async () => {
      const qs = navigator.onLine
        ? `playlistId=${encodeURIComponent(playlist.id)}&forceRefresh=1`
        : `playlistId=${encodeURIComponent(playlist.id)}`;
      try {
        const res = await fetch(`/api/playlist?${qs}`);
        const data = await res.json().catch(() => ({ tracks: [] }));
        if (cancelled) return;
        if (!res.ok) {
          // forceRefresh failed (no internet) → try cache
          if (navigator.onLine) {
            const r2 = await fetch(`/api/playlist?playlistId=${encodeURIComponent(playlist.id)}`);
            const d2 = await r2.json().catch(() => ({ tracks: [] }));
            if (!cancelled) {
              setTracks((d2.tracks || []) as Track[]);
              callbackRef.current?.(playlist, (d2.tracks || []) as Track[]);
            }
          } else {
            setError(data.error || 'Failed to load tracks');
          }
          return;
        }
        const loaded = (data.tracks || []) as Track[];
        setTracks(loaded);
        callbackRef.current?.(playlist, loaded);
      } catch (err) {
        if (cancelled) return;
        // Network error → try cache
        try {
          const r2 = await fetch(`/api/playlist?playlistId=${encodeURIComponent(playlist.id)}`);
          const d2 = await r2.json().catch(() => ({ tracks: [] }));
          if (!cancelled) {
            setTracks((d2.tracks || []) as Track[]);
            callbackRef.current?.(playlist, (d2.tracks || []) as Track[]);
          }
        } catch {
          if (!cancelled) setError('Failed to load tracks');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [playlist.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (loading) return;
    const el = trackListRef.current;
    if (!el) return;
    const onScroll = () => setIsCollapsed(el.scrollTop > 60);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [loading]);

  const filteredTracks = useMemo(() => {
    if (!trackSearchQuery.trim()) return tracks;
    const q = trackSearchQuery.toLowerCase().trim();
    return tracks.filter(
      (t) => t.title.toLowerCase().includes(q) || cleanArtistName(t.artist).toLowerCase().includes(q)
    );
  }, [tracks, trackSearchQuery]);

  const downloadedCount = tracks.filter((t) => t.downloaded).length;
  const downloadedTracks = filteredTracks.filter((t) => t.downloaded);

  if (loading) {
    return <PlaylistViewSkeleton />;
  }

  return (
    <div className="h-full w-full min-w-0 flex flex-col min-h-0 relative">
      {/* Sticky top mini header that smoothly merges in when scrolled */}
      <div
        className={`absolute top-0 left-0 right-0 z-20 px-6 py-3 bg-[#0A0A0A]/90 backdrop-blur-md border-b border-white/10 flex items-center justify-between gap-4 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isCollapsed
            ? 'opacity-100 translate-y-0 pointer-events-auto shadow-xl'
            : 'opacity-0 -translate-y-3 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/5 shrink-0 border border-white/10">
            {playlist.thumbnailUrl ? (
              <img
                src={`/api/playlist-thumbnail?playlistId=${encodeURIComponent(playlist.id)}&url=${encodeURIComponent(playlist.thumbnailUrl)}`}
                alt={playlist.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#00F2FE]/20 to-[#1a1a2e]">
                <Music className="w-4 h-4 text-white/20" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex items-baseline gap-2.5">
            <h2 className="font-bold text-white text-base truncate">{playlist.title}</h2>
            <span className="text-xs text-white/40 shrink-0 font-medium">{tracks.length} tracks</span>
          </div>
        </div>

        <div className="relative w-48 sm:w-64 shrink-0">
          <Search className="w-3.5 h-3.5 text-white/50 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={trackSearchQuery}
            onChange={(e) => setTrackSearchQuery(e.target.value)}
            placeholder="Search tracks..."
            className="w-full h-8 bg-white/5 border border-white/10 rounded-xl pl-9 pr-8 text-xs text-white placeholder-white/40 outline-none focus:outline-none focus:border-[#00F2FE]/50 caret-[#00F2FE] transition-all duration-300"
          />
          {trackSearchQuery && (
            <button
              onClick={() => setTrackSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors duration-200"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div ref={trackListRef} className="pb-36 flex-1 min-h-0 overflow-y-auto scrollbar-thin relative">
        <div className="px-6 select-none shrink-0 pt-6 pb-4 flex items-center gap-4 overflow-hidden">
          <div className="w-28 h-28 rounded-2xl overflow-hidden bg-white/5 shrink-0 shadow-2xl relative border border-white/10">
            {playlist.thumbnailUrl ? (
              <img
                src={`/api/playlist-thumbnail?playlistId=${encodeURIComponent(playlist.id)}&url=${encodeURIComponent(playlist.thumbnailUrl)}`}
                alt={playlist.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#00F2FE]/20 to-[#1a1a2e]">
                <Music className="w-8 h-8 text-white/20" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <span className="text-xs font-semibold text-white/40 uppercase tracking-wider block mb-1">
                Playlist
              </span>
              <h1 className="font-black text-white text-2xl truncate">
                {playlist.title}
              </h1>
              {playlist.description && (
                <p className="text-xs text-white/40 mt-1 line-clamp-1">{playlist.description}</p>
              )}
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs text-white/50">{loading ? '…' : `${tracks.length} tracks`}</span>
                {!loading && (
                  <span className="text-xs text-white/40">
                    {downloadedCount === 0
                      ? 'Not downloaded'
                      : `${downloadedCount} / ${tracks.length} downloaded`}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-3 flex-wrap overflow-hidden pb-1">
                {downloadedCount > 0 && (
                  <button
                    onClick={() => onPlay(downloadedTracks[0], downloadedTracks)}
                    className="flex shrink items-center justify-center gap-1.5 px-4 sm:px-6 py-2 bg-[#00F2FE] hover:bg-[#00C7D3] rounded-2xl text-black text-xs sm:text-sm font-semibold transition-all duration-300 ease-out shadow-lg hover:shadow-[0_0_22px_rgba(0,242,254,0.28)]"
                  >
                    <Play className="w-3.5 h-3.5 fill-black" />
                    Play
                  </button>
                )}
                {downloadedCount < tracks.length && !loading && (
                  <button
                    onClick={() => {
                      const unDownloadedIds = tracks.filter((t) => !t.downloaded).map((t) => t.videoId);
                      setDownloadingIds((prev) => new Set([...prev, ...unDownloadedIds]));
                      onDownload(playlist.id);
                    }}
                    className="flex shrink items-center justify-center gap-1.5 px-3.5 sm:px-5 py-2 rounded-2xl border border-white/15 text-white hover:text-[#00F2FE] hover:border-[#00F2FE]/40 text-xs sm:text-sm font-medium transition-all duration-300 ease-out bg-white/5 hover:bg-[#1A1A1A]"
                  >
                    <Download className="w-3.5 h-3.5 text-[#00F2FE]" />
                    {downloadedCount === 0 ? 'Download All' : `Download Remaining (${tracks.length - downloadedCount})`}
                  </button>
                )}
                <button
                  onClick={() => onTogglePin(playlist.id)}
                  className={`flex shrink items-center justify-center gap-1.5 px-4 sm:px-5 py-2 rounded-2xl border text-xs sm:text-sm font-medium transition-all duration-300 ease-out ${
                    isPinned
                      ? 'border-[#00F2FE]/40 text-[#00F2FE] bg-[#00F2FE]/10 hover:bg-[#00F2FE]/20'
                      : 'border-white/15 text-white/70 hover:text-white hover:border-white/30 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
                  {isPinned ? 'Unpin' : 'Pin'}
                </button>
                <button
                  onClick={() => onToggleHidden(playlist.id)}
                  className={`flex shrink items-center justify-center gap-1.5 px-4 sm:px-5 py-2 rounded-2xl border text-xs sm:text-sm font-medium transition-all duration-300 ease-out ${
                    isHidden
                      ? 'border-[#00F2FE]/40 text-[#00F2FE] bg-[#00F2FE]/10 hover:bg-[#00F2FE]/20'
                      : 'border-white/15 text-white/70 hover:text-white hover:border-white/30 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  {isHidden ? (
                    <>
                      <Eye className="w-3.5 h-3.5 text-[#00F2FE]" />Unhide
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />Hide
                    </>
                  )}
                </button>
                {!loading && tracks.length > 1 && !trackSearchQuery && (
                  <button
                    disabled={isSavingOrder}
                    onClick={handleToggleEditOrder}
                    className={`flex shrink items-center justify-center gap-1.5 px-4 sm:px-5 py-2 rounded-2xl border text-xs sm:text-sm font-medium transition-all duration-300 ease-out ${
                      isEditOrder
                        ? 'border-[#00F2FE]/50 text-[#00F2FE] bg-[#00F2FE]/10 hover:bg-[#00F2FE]/20'
                        : 'border-white/15 text-white/70 hover:text-white hover:border-white/30 bg-white/5 hover:bg-white/10'
                    } ${isSavingOrder ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isSavingOrder ? (
                      <><DownloadingSpinner />Syncing...</>
                    ) : isEditOrder ? (
                      <><Check className="w-3.5 h-3.5" />Done</>
                    ) : (
                      <><ArrowUpDown className="w-3.5 h-3.5" />Edit Order</>
                    )}
                  </button>
                )}
                <div className="relative flex-1 min-w-[140px] max-w-[220px]">
                  <Search className="w-3.5 h-3.5 text-white absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={trackSearchQuery}
                    onChange={(e) => setTrackSearchQuery(e.target.value)}
                    placeholder="Search tracks..."
                    className="w-full h-8 bg-white/5 border border-white/10 rounded-xl pl-9 pr-8 text-xs text-white placeholder-white outline-none focus:outline-none focus:border-[#00F2FE]/50 caret-[#00F2FE] transition-all duration-300 ease-out"
                  />
                  {trackSearchQuery && (
                    <button
                      onClick={() => setTrackSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white hover:text-[#00F2FE] transition-colors duration-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6">
          {!error && tracks.length > 0 && trackSearchQuery && (
            <div className="mb-4 text-xs text-white/40 font-medium">
              {filteredTracks.length} of {tracks.length} tracks
            </div>
          )}

          {error && <div className="text-center py-16 text-white/40 text-sm">{error}</div>}

          {!loading && !error && (
            <table className="w-full table-fixed">
              <thead>
                <tr className={`text-white/30 text-xs font-medium border-b border-white/5 ${
                  isEditOrder ? 'transition-all' : ''
                }`}>
                  <th className="text-left py-3 px-3 w-10">{isEditOrder ? '' : '#'}</th>
                  <th className="text-left py-3 px-3 w-[46%]">Title</th>
                  <th className="text-left py-3 px-3 hidden md:table-cell">Artist</th>
                  <th className="text-right py-3 px-3 hidden lg:table-cell w-28">Date added</th>
                  <th className="text-right py-3 px-3 w-16">Time</th>
                  <th className="text-center py-3 px-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filteredTracks.map((track, idx) => {
                  const isActive = track.videoId === currentVideoId && playlist.id === activePlaylistId;
                  const canPlay = !!track.downloaded && !isEditOrder;
                  const artist = cleanArtistName(track.artist);
                  const isDragOver = isEditOrder && dragOverIndex === idx && draggingId !== track.videoId;
                  const isDraggingThis = draggingId === track.videoId;
                  return (
                    <tr
                      key={track.videoId}
                      draggable={isEditOrder}
                      onDragStart={isEditOrder ? (e) => handleDragStart(e, idx, track.videoId) : undefined}
                      onDragOver={isEditOrder ? (e) => handleDragOver(e, idx) : undefined}
                      onDrop={isEditOrder ? (e) => handleDrop(e, idx) : undefined}
                      onDragEnd={isEditOrder ? handleDragEnd : undefined}
                      data-song-context="true"
                      onContextMenu={!isEditOrder ? (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setContextMenu({ track, x: event.clientX, y: event.clientY });
                      } : undefined}
                      onClick={() => {
                        if (!canPlay) return;
                        const trackIndex = downloadedTracks.findIndex((t) => t.videoId === track.videoId);
                        const queueFromHere = trackIndex !== -1 ? downloadedTracks.slice(trackIndex) : [track];
                        onPlay(track, queueFromHere);
                      }}
                      className={`group transition-all duration-150 rounded-xl ${
                        isEditOrder
                          ? isDraggingThis
                            ? 'opacity-30 bg-white/5'
                            : 'cursor-grab active:cursor-grabbing hover:bg-white/[0.06]'
                          : canPlay
                            ? 'cursor-pointer hover:bg-white/[0.09]'
                            : 'cursor-default opacity-50'
                      } ${isActive && !isEditOrder ? 'bg-white/[0.08]' : ''} ${
                        isDragOver ? 'border-t-[2.5px] border-[#00F2FE] rounded-none' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center w-10 relative">
                        {isEditOrder ? (
                          <GripVertical className="w-4 h-4 text-white/30 mx-auto" />
                        ) : isActive ? (
                          <NowPlayingBars />
                        ) : downloadingIds.has(track.videoId) ? (
                          <DownloadingSpinner />
                        ) : (
                          <>
                            <span className="text-white/30 text-sm group-hover:opacity-0">{idx + 1}</span>
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Play className="w-3.5 h-3.5 fill-white text-white" />
                            </div>
                          </>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 aspect-square rounded-xl overflow-hidden bg-white/5 shrink-0 border border-white/5">
                            <img
                              src={`/api/thumbnail?videoId=${track.videoId}&url=${encodeURIComponent(track.thumbnailUrl)}`}
                              alt={track.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className={`text-sm font-medium truncate ${isActive ? 'text-[#00F2FE]' : 'text-white'}`}>
                              {track.title}
                            </p>
                            <p className="text-xs text-white/40 truncate md:hidden">{artist}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 hidden md:table-cell">
                        <span className="text-sm text-white/50 truncate">{artist}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right hidden lg:table-cell">
                        <span className="text-sm text-white/30">
                          {track.dateAdded ? formatRelativeDate(track.dateAdded) : '—'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="text-sm text-white/30">
                          {track.duration ? formatDuration(track.duration) : '–'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center w-12">
                        {!isEditOrder && onAddToQueue && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              setContextMenu({ track, x: rect.right, y: rect.bottom });
                            }}
                            className="p-1.5 rounded-lg text-white/40 hover:text-[#00F2FE] hover:bg-white/10 transition-all opacity-0 group-hover:opacity-100"
                            title="More actions"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {contextMenu && onPlayNext && onAddToPlaylist && onRemoveFromPlaylist && onSetSleepTimer && onOpenSleepTimer && (
        <SongContextMenu
          track={contextMenu.track}
          playlists={playlists}
          x={contextMenu.x}
          y={contextMenu.y}
          onPlayNext={onPlayNext}
          onAddToQueue={onAddToQueue ?? (() => {})}
          onAddToPlaylist={onAddToPlaylist}
          onRemoveFromPlaylist={handleRemoveTrackLocal}
          playlistId={playlist.id}
          onSetSleepTimer={onSetSleepTimer}
          onOpenSleepTimer={onOpenSleepTimer}
          onDownloadTrack={onDownloadTrack ? handleDownloadTrack : undefined}
          onDeleteTrack={onDeleteTrack ? handleDeleteTrack : undefined}
          isDownloading={downloadingIds.has(contextMenu.track.videoId)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

function NowPlayingBars() {
  return (
    <div className="flex items-end justify-center gap-[2px] h-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-[3px] bg-[#00F2FE] rounded-xl animate-music-bar"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

/** Animated downloading spinner shown in the track number column */
function DownloadingSpinner() {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <svg
        className="w-4 h-4 animate-spin text-[#00F2FE]"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12" cy="12" r="10"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          className="opacity-90"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    </div>
  );
}

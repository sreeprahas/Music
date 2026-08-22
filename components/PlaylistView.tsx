'use client';

import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import type { Playlist, Track } from '@/types';
import { formatDuration, cleanArtistName, getThumbnailUrl, getTrackThumbnailUrl } from '@/lib/ytmusicFormat';
import { Pin, Eye, EyeOff, Play, Download, Music, Search, X, MoreVertical, GripVertical, ArrowUpDown, Check, ListPlus, Loader2, RefreshCw, Link2 } from 'lucide-react';
import { SongContextMenu } from './SongContextMenu';
import { Skeleton } from './Skeleton';
import { PlaylistArtwork } from './PlaylistArtwork';

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
        <div className="border-b border-border-subtle pb-3 mb-1 flex gap-3 px-3">
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
  onSetMatchOverride?: (track: Track) => void;
  onTrackDeleted?: (videoId: string) => void;
  onTogglePin: (playlistId: string) => void;
  onTracksLoaded?: (playlist: Playlist, tracks: Track[]) => void;
  lastDownloadedTrack?: { videoId: string; timestamp: number } | null;
  restoredTrack?: { track: Track; playlistId: string; timestamp: number } | null;
  currentVideoId?: string;
  activePlaylistId?: string | null;
  isPlaying?: boolean;
  scrollToTrackRequest?: number;
  onEditOrderChange?: (isEditing: boolean) => void;
  recommendations?: Track[];
  playlistMutation?: { type: 'add' | 'remove'; track: Track; playlistId: string; timestamp: number } | null;
}

export function PlaylistView({
  playlist,
  isPinned,
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
  onSetMatchOverride,
  onTrackDeleted,
  onTogglePin,
  onTracksLoaded,
  lastDownloadedTrack,
  restoredTrack,
  currentVideoId,
  activePlaylistId,
  isPlaying = false,
  scrollToTrackRequest = 0,
  onEditOrderChange,
  recommendations = [],
  playlistMutation,
}: Props) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const tracksRef = useRef<Track[]>([]);
  const [loading, setLoading] = useState(playlist.trackCount > 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreTracks, setHasMoreTracks] = useState(true);
  const prefetchNextPageRef = useRef(false);
  const [error, setError] = useState('');
  const [trackSearchQuery, setTrackSearchQuery] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ track: Track; x: number; y: number } | null>(null);
  const contextMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const playlistViewRef = useRef<HTMLDivElement>(null);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const lastSelectedIndexRef = useRef<number | null>(null);
  const [visibleRecommendations, setVisibleRecommendations] = useState<Track[]>(recommendations);
  // Track which videoIds are currently being downloaded (spinner shown)
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const trackListRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onTracksLoaded);
  callbackRef.current = onTracksLoaded;
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);

  useEffect(() => setVisibleRecommendations(recommendations), [recommendations]);

  // Edit order drag mode
  const [isEditOrder, setIsEditOrder] = useState(false);

  useEffect(() => {
    onEditOrderChange?.(isEditOrder);
  }, [isEditOrder, onEditOrderChange]);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [hasReordered, setHasReordered] = useState(false);
  const [sourceSyncStatus, setSourceSyncStatus] = useState<Playlist['syncStatus']>(playlist.syncStatus ?? 'idle');
  const [sourceSyncError, setSourceSyncError] = useState(playlist.syncError ?? '');
  const [isSyncingSource, setIsSyncingSource] = useState(false);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragOverBefore, setDragOverBefore] = useState<boolean>(true); // true = insert before, false = insert after
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Ref to suppress click that fires on the row immediately after a drag drop
  const justDroppedRef = useRef(false);
  // Snapshot of track order when edit mode was entered, to detect no-op reorders
  const originalTrackOrderRef = useRef<string[]>([]);

  useEffect(() => {
    setSourceSyncStatus(playlist.syncStatus ?? 'idle');
    setSourceSyncError(playlist.syncError ?? '');
    if (!playlist.source || !playlist.sourcePlaylistId) return;

    let cancelled = false;
    fetch(`/api/playlist/sync?playlistId=${encodeURIComponent(playlist.id)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        const state = payload?.state;
        if (!cancelled && state) {
          setSourceSyncStatus(state.status ?? 'idle');
          setSourceSyncError(state.error ?? '');
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [playlist.id, playlist.source, playlist.sourcePlaylistId, playlist.syncError, playlist.syncStatus]);

  const handleSyncSource = useCallback(async () => {
    if (!playlist.source || !playlist.sourcePlaylistId || isSyncingSource) return;
    setIsSyncingSource(true);
    setSourceSyncStatus('syncing');
    setSourceSyncError('');
    try {
      const response = await fetch('/api/playlist/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistId: playlist.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Sync failed');
      const state = result.state;
      setSourceSyncStatus(state?.status ?? 'idle');
      setSourceSyncError(state?.error ?? '');

      // Dynamically refresh tracks from SQLite
      const res = await fetch(`/api/playlist?playlistId=${encodeURIComponent(playlist.id)}&limit=999&offset=0`);
      const data = await res.json().catch(() => ({ tracks: [] }));
      if (res.ok && Array.isArray(data.tracks)) {
        tracksRef.current = data.tracks;
        setTracks(data.tracks);
        callbackRef.current?.(playlist, data.tracks);
      }
    } catch (syncError) {
      setSourceSyncStatus('error');
      setSourceSyncError(syncError instanceof Error ? syncError.message : 'Sync failed');
    } finally {
      setIsSyncingSource(false);
    }
  }, [isSyncingSource, playlist, playlist.id, playlist.source, playlist.sourcePlaylistId]);

  const handleReplaceSource = useCallback(async () => {
    const sourceUrl = window.prompt('Paste the replacement Spotify or YouTube playlist URL', playlist.sourceUrl || '');
    if (!sourceUrl?.trim()) return;
    setSourceSyncStatus('syncing');
    setSourceSyncError('');
    try {
      const response = await fetch('/api/playlist/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistId: playlist.id, sourceUrl: sourceUrl.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Source replacement failed');

      const updatedPlaylist = (result.playlist || playlist) as Playlist;
      const updatedTracks = (result.tracks || []) as Track[];
      tracksRef.current = updatedTracks;
      setTracks(updatedTracks);
      setSourceSyncStatus('idle');
      callbackRef.current?.(updatedPlaylist, updatedTracks);
    } catch (replaceError) {
      setSourceSyncStatus('error');
      setSourceSyncError(replaceError instanceof Error ? replaceError.message : 'Source replacement failed');
    }
  }, [playlist]);

  const handleDragStart = useCallback((e: React.DragEvent, idx: number, videoId: string) => {
    dragIndexRef.current = idx;
    setDraggingId(videoId);
    justDroppedRef.current = false;
    e.dataTransfer.effectAllowed = 'move';
    // Transparent drag ghost so cursor stays clean
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
    // Determine insert-before vs insert-after from cursor Y relative to the row midpoint
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const insertBefore = e.clientY < rect.top + rect.height / 2;
    setDragOverIndex(idx);
    setDragOverBefore(insertBefore);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    const fromIdx = dragIndexRef.current;
    dragIndexRef.current = null;
    setDragOverIndex(null);
    setDraggingId(null);

    if (fromIdx === null) return;

    // Determine final insert position based on cursor side
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const insertBefore = e.clientY < rect.top + rect.height / 2;
    // Compute the target index in the ORIGINAL array (before splice)
    let targetIdx = insertBefore ? dropIdx : dropIdx + 1;
    // Adjust for the gap left by removing the dragged item
    if (fromIdx < targetIdx) targetIdx -= 1;
    if (fromIdx === targetIdx) return; // no change

    justDroppedRef.current = true;
    setTracks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
    setHasReordered(true);
  }, []);

  const handleToggleEditOrder = useCallback(() => {
    if (isEditOrder) {
      // Exiting edit mode ("Done" clicked) — only sync if order actually changed
      setIsEditOrder(false);
      const currentOrder = tracks.map((t) => t.videoId);
      const unchanged = originalTrackOrderRef.current.length === currentOrder.length &&
        originalTrackOrderRef.current.every((id, i) => id === currentOrder[i]);
      if (hasReordered && !unchanged) {
        setIsSavingOrder(true);
        fetch('/api/playlist/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playlistId: playlist.id, videoIds: currentOrder }),
        })
          .catch((e) => console.error('Failed to sync reordered playlist with YouTube:', e))
          .finally(() => {
            setIsSavingOrder(false);
            setHasReordered(false);
          });
      } else {
        setHasReordered(false);
      }
    } else {
      // Entering edit mode — snapshot the current order
      originalTrackOrderRef.current = tracks.map((t) => t.videoId);
      setIsEditOrder(true);
      setHasReordered(false);
    }
  }, [isEditOrder, hasReordered, playlist.id, tracks]);

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
    setDragOverBefore(true);
    setDraggingId(null);
  }, []);

  // Local wrapper: shows spinner, calls parent handler, updates track state optimistically
  const handleDownloadTrack = useCallback(async (track: Track) => {
    if (!onDownloadTrack) return;
    setDownloadingIds((prev) => new Set([...prev, track.videoId]));
    try {
      await onDownloadTrack(track);
      // Mark track as downloaded in local state (no page reload)
      setTracks((prev) => prev.map((t) => (t.videoId === track.videoId ? { ...t, downloaded: true } : t)));
    } finally {
      setDownloadingIds((prev) => {
        const n = new Set(prev);
        n.delete(track.videoId);
        return n;
      });
    }
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

  const handleAddTrackLocal = useCallback(async (track: Track, targetPlaylistId: string) => {
    if (targetPlaylistId === playlist.id) {
      setTracks((prev) => {
        if (prev.some((item) => item.videoId === track.videoId)) return prev;
        return [...prev, { ...track, playlistId: targetPlaylistId, position: prev.length }];
      });
    }
    await onAddToPlaylist?.(track, targetPlaylistId);
  }, [onAddToPlaylist, playlist.id]);

  useEffect(() => {
    if (!playlistMutation || playlistMutation.playlistId !== playlist.id) return;
    if (playlistMutation.type === 'remove') {
      setTracks((prev) => prev.some((item) => item.videoId === playlistMutation.track.videoId)
        ? prev.filter((item) => item.videoId !== playlistMutation.track.videoId)
        : prev);
      return;
    }
    setTracks((prev) => prev.some((item) => item.videoId === playlistMutation.track.videoId)
      ? prev
      : [...prev, { ...playlistMutation.track, playlistId: playlist.id, position: prev.length }]);
  }, [playlist.id, playlistMutation, tracks]);

  useEffect(() => {
    const handlePlaylistKeyDown = (event: KeyboardEvent) => {
      if (isEditOrder || selectedTrackIds.size === 0 || (event.key !== 'Delete' && event.key !== 'Backspace')) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      tracks.filter((track) => selectedTrackIds.has(track.videoId)).forEach((track) => {
        handleRemoveTrackLocal(track, playlist.id);
      });
      setSelectedTrackIds(new Set());
      lastSelectedIndexRef.current = null;
    };
    window.addEventListener('keydown', handlePlaylistKeyDown);
    return () => window.removeEventListener('keydown', handlePlaylistKeyDown);
  }, [handleRemoveTrackLocal, isEditOrder, playlist.id, selectedTrackIds, tracks]);

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
    prefetchNextPageRef.current = false;
    setError('');
    // Reset tracks immediately when revision changes so stale data is never shown
    setTracks([]);
    tracksRef.current = [];
    setLoading(true);

    const load = async () => {
      const acceptLoadedTracks = (loaded: Track[], hasMore: boolean) => {
        if (cancelled) return false;
        tracksRef.current = loaded;
        setTracks(loaded);
        setHasMoreTracks(hasMore);
        callbackRef.current?.(playlist, loaded);
        return true;
      };
      try {
        const response = await fetch(
          `/api/playlist?playlistId=${encodeURIComponent(playlist.id)}&limit=999&offset=0`
        );
        const data = await response.json().catch(() => ({ tracks: [] }));
        if (!cancelled && response.ok && Array.isArray(data.tracks)) {
          acceptLoadedTracks(data.tracks as Track[], Boolean(data.hasMore));
        } else if (!cancelled) {
          setError('Failed to load tracks');
        }
      } catch (err) {
        if (!cancelled) setError('Failed to load tracks');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  // sourceRevision changes when the same playlist is re-imported with different tracks
  }, [playlist.id, playlist.sourceRevision]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load retrieves full playlist from SQLite (limit=999)
  // Header collapse on scroll
  useEffect(() => {
    if (loading) return;
    const el = trackListRef.current;
    if (!el) return;
    const onScroll = () => setIsCollapsed(el.scrollTop > 60);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [loading, tracks.length, playlist.id]);

  // Load the remainder immediately in the background. The first page is
  // Removed prefetch logic - now loading full playlist on initial load
  useEffect(() => {
    // Placeholder for removed prefetch logic
  }, []);

  useEffect(() => {
    if (!scrollToTrackRequest || loading || !currentVideoId) return;
    if (activePlaylistId !== playlist.id) return;
    const row = Array.from(trackListRef.current?.querySelectorAll<HTMLElement>('[data-video-id]') ?? [])
      .find((element) => element.dataset.videoId === currentVideoId);
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [scrollToTrackRequest, loading, currentVideoId, tracks, activePlaylistId, playlist.id]);

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
    <div ref={playlistViewRef} className="h-full w-full min-w-0 flex flex-col min-h-0 relative overflow-hidden">
      {/* Sticky top mini header that smoothly merges in when scrolled */}
      <div
        className={`absolute top-0 left-0 right-0 z-20 px-6 py-3 bg-background-secondary backdrop-blur-md border-b border-border flex items-center justify-between gap-4 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isCollapsed
            ? 'opacity-100 translate-y-0 pointer-events-auto shadow-xl'
            : 'opacity-0 -translate-y-3 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 aspect-square rounded-[4px] overflow-hidden bg-surface shrink-0 border border-border">
            <PlaylistArtwork playlist={playlist} />
          </div>
          <div className="min-w-0 flex items-baseline gap-2.5">
            <h2 className="font-bold text-text text-base truncate">{playlist.title}</h2>
            <span className="text-xs text-text-muted shrink-0 font-medium">{playlist.trackCount || tracks.length} tracks</span>
          </div>
        </div>

        <div className="relative w-48 sm:w-64 shrink-0">
          <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={trackSearchQuery}
            onChange={(e) => setTrackSearchQuery(e.target.value)}
            placeholder="Search tracks..."
            className="w-full h-8 bg-surface border border-transparent rounded-xl pl-9 pr-8 text-xs text-text placeholder:text-text-muted outline-none focus:outline-none hover:border-accent/30 hover:bg-accent/10 hover:shadow-accent-soft focus:border-accent/45 focus:bg-accent/14 focus:shadow-accent-medium caret-accent transition-[background-color,box-shadow] duration-500 ease-out"
          />
          {trackSearchQuery && (
            <button
              onClick={() => setTrackSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors duration-200"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div ref={trackListRef} className="pb-36 flex-1 min-h-0 overflow-y-auto scrollbar-thin relative">
        <div className="px-6 select-none shrink-0 pt-6 pb-4 flex items-center gap-4 overflow-hidden">
          <div className="w-28 h-28 aspect-square rounded-[4px] overflow-hidden bg-surface shrink-0 shadow-2xl relative border border-border">
            <PlaylistArtwork playlist={playlist} />
          </div>

          <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider block mb-1">
                Playlist
              </span>
              <h1 className="font-black text-text text-2xl truncate">
                {playlist.title}
              </h1>
              {playlist.description && (
                <p className="text-xs text-text-muted mt-1 line-clamp-1">{playlist.description}</p>
              )}
              <div className="flex items-center gap-3 mt-2">
                <span className="flex items-center gap-1.5 text-xs text-text-muted">{playlist.trackCount} tracks</span>
                {!loading && (
                  <span className="text-xs text-text-muted">
                    {downloadedCount === 0
                      ? 'Not downloaded'
                      : `${downloadedCount} / ${playlist.trackCount} downloaded`}
                  </span>
                )}
                {playlist.source && playlist.source !== 'local' && playlist.sourcePlaylistId && (
                  <span className="inline-flex items-center gap-3 text-[11px] text-text-muted">
                    <button
                      type="button"
                      onClick={handleSyncSource}
                      disabled={isSyncingSource}
                      className="inline-flex items-center gap-1 text-text-secondary hover:text-accent disabled:opacity-50 transition-colors cursor-pointer"
                      title={sourceSyncError || `Sync ${playlist.source} playlist`}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSource ? 'animate-spin' : ''}`} />
                      {sourceSyncStatus === 'readonly' ? 'Read-only' : sourceSyncStatus === 'conflict' ? 'Conflict' : sourceSyncStatus === 'error' ? 'Retry' : sourceSyncStatus === 'syncing' ? 'Syncing' : 'Sync'}
                    </button>
                    <button type="button" onClick={handleReplaceSource} className="inline-flex items-center gap-1 text-text-muted hover:text-accent transition-colors cursor-pointer" title="Replace linked playlist source">
                      <Link2 className="w-3.5 h-3.5" /> Change source
                    </button>
                  </span>
                )}
              </div>

              {sourceSyncError && playlist.source && playlist.source !== 'local' && (
                <p className="text-[10px] text-warning/80 mt-1 truncate" title={sourceSyncError}>
                  {sourceSyncError}
                </p>
              )}

              <div className="flex items-center gap-2 mt-3 flex-wrap overflow-hidden pb-1">
                {downloadedCount > 0 && (
                  <button
                    onClick={() => onPlay(downloadedTracks[0], downloadedTracks)}
                    className="flex shrink items-center justify-center gap-1.5 px-4 sm:px-6 py-2 bg-accent hover:bg-accent-hover rounded-2xl text-background text-xs sm:text-sm font-semibold transition-all duration-300 ease-out shadow-lg hover:shadow-accent-medium"
                  >
                    <Play className="w-3.5 h-3.5 fill-background" />
                    Play
                  </button>
                )}
                {downloadedCount < playlist.trackCount && !loading && (
                  <button
                    onClick={async () => {
                      const unDownloadedIds = tracks.filter((t) => !t.downloaded).map((t) => t.videoId);
                      setDownloadingIds((prev) => new Set([...prev, ...unDownloadedIds]));
                      onDownload(playlist.id);
                    }}
                    className="flex shrink items-center justify-center gap-1.5 px-3.5 sm:px-5 py-2 rounded-2xl border border-border-strong text-text hover:text-accent hover:border-accent/40 text-xs sm:text-sm font-medium transition-all duration-300 ease-out bg-surface hover:bg-surface-hover"
                  >
                    <Download className="w-3.5 h-3.5 text-accent" />
                    {downloadedCount === 0 ? 'Download All' : `Download Remaining (${tracks.length - downloadedCount})`}
                  </button>
                )}
                {!loading && tracks.length > 1 && !trackSearchQuery && (
                  <button
                    disabled={isSavingOrder}
                    onClick={handleToggleEditOrder}
                    className={`flex shrink items-center justify-center gap-1.5 px-4 sm:px-5 py-2 rounded-2xl border text-xs sm:text-sm font-medium transition-all duration-300 ease-out ${
                      isEditOrder
                        ? 'border-accent/50 text-accent bg-accent/10 hover:bg-accent/20'
                        : 'border-border-strong text-text-secondary hover:text-text hover:border-border-strong bg-surface hover:bg-surface-hover'
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
                  <Search className="w-3.5 h-3.5 text-text absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={trackSearchQuery}
                    onChange={(e) => setTrackSearchQuery(e.target.value)}
                    placeholder="Search tracks..."
                    className="w-full h-8 bg-surface border border-transparent rounded-xl pl-9 pr-8 text-xs text-text placeholder:text-text-muted outline-none focus:outline-none hover:border-accent/30 hover:bg-accent/10 hover:shadow-accent-soft focus:border-accent/45 focus:bg-accent/14 focus:shadow-accent-medium caret-accent transition-[background-color,box-shadow] duration-500 ease-out"
                  />
                  {trackSearchQuery && (
                    <button
                      onClick={() => setTrackSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text hover:text-accent transition-colors duration-300"
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
            <div className="mb-4 text-xs text-text-muted font-medium">
              {filteredTracks.length} of {tracks.length} tracks
            </div>
          )}

          {error && <div className="text-center py-16 text-text-muted text-sm">{error}</div>}

          {!loading && !error && (
            <table className="w-full table-fixed">
              <thead>
                <tr className={`text-text-disabled text-xs font-medium border-b border-border-subtle ${
                  isEditOrder ? 'transition-all' : ''
                }`}>
                  <th className="text-left py-3 px-3 w-10">{isEditOrder ? '' : '#'}</th>
                  <th className="text-left py-3 px-3 w-[42%]">Title</th>
                  <th className="text-left py-3 px-3 w-[22%]">Artist</th>
                  <th className="playlist-date-column text-right py-3 px-3 w-32">Date added</th>
                  <th className="playlist-time-column text-right py-3 px-3 w-20">Time</th>
                  <th className="text-center py-3 px-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filteredTracks.map((track, idx) => {
                  const trackKey = track.videoId || track.sourceTrackId;
                  const isCurrent = Boolean(currentVideoId) && Boolean(trackKey) && (
                    currentVideoId === track.videoId || (Boolean(track.sourceTrackId) && currentVideoId === track.sourceTrackId)
                  );
                  const isActive = isCurrent && playlist.id === activePlaylistId;
                  const canPlay = !isEditOrder;
                  const artist = cleanArtistName(track.artist);
                  const isDragOver = isEditOrder && dragOverIndex === idx && draggingId !== track.videoId;
                  const isDraggingThis = draggingId === track.videoId;
                  // Drop indicator: show line above or below the hovered row
                  const showIndicatorBefore = isDragOver && dragOverBefore;
                  const showIndicatorAfter = isDragOver && !dragOverBefore;
                  return (
                    <tr
                      key={`${track.videoId || track.sourceTrackId || idx}-${track.playlistItemId || idx}`}
                      data-video-id={track.videoId || track.sourceTrackId}
                      draggable={isEditOrder}
                      onDragStart={isEditOrder ? (e) => handleDragStart(e, idx, track.videoId || track.sourceTrackId || '') : undefined}
                      onDragOver={isEditOrder ? (e) => handleDragOver(e, idx) : undefined}
                      onDrop={isEditOrder ? (e) => handleDrop(e, idx) : undefined}
                      onDragEnd={isEditOrder ? handleDragEnd : undefined}
                      data-song-context="true"
                      onContextMenu={!isEditOrder ? (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setContextMenu({ track, x: event.clientX, y: event.clientY });
                      } : undefined}
                      onClick={(event) => {
                        // Block all clicks in edit mode, and suppress the ghost click right after a drop
                        if (isEditOrder) return;
                        if (justDroppedRef.current) {
                          justDroppedRef.current = false;
                          return;
                        }
                        if (event.shiftKey || event.ctrlKey || event.metaKey) {
                          const rangeStart = lastSelectedIndexRef.current ?? idx;
                          const start = Math.min(rangeStart, idx);
                          const end = Math.max(rangeStart, idx);
                          setSelectedTrackIds((prev) => {
                            const next = event.shiftKey ? new Set(prev) : new Set<string>();
                            for (let i = start; i <= end; i++) next.add(filteredTracks[i].videoId || filteredTracks[i].sourceTrackId || String(i));
                            return next;
                          });
                          lastSelectedIndexRef.current = idx;
                          return;
                        }
                        setSelectedTrackIds(new Set());
                        lastSelectedIndexRef.current = idx;
                        if (!canPlay) return;
                        const queueForTrack = tracks;
                        onPlay(track, queueForTrack);
                      }}
                      className={`group transition-all duration-150 rounded-2xl ${
                        isEditOrder
                          ? isDraggingThis
                            ? 'opacity-30 bg-surface'
                            : 'cursor-grab active:cursor-grabbing hover:bg-surface-hover/50'
                          : 'cursor-pointer'
                      } ${
                        selectedTrackIds.has(track.videoId || track.sourceTrackId || '')
                          ? 'bg-surface-active/70 ring-1 ring-inset ring-border'
                          : isActive && !isEditOrder
                          ? 'bg-accent/15 ring-1 ring-accent/30 shadow-sm'
                          : 'hover:bg-surface-hover/50'
                      } ${
                        showIndicatorBefore ? 'border-t-[2.5px] border-accent rounded-none' :
                        showIndicatorAfter ? 'border-b-[2.5px] border-accent rounded-none' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center w-10 relative">
                        {isEditOrder ? (
                          <GripVertical className="w-4 h-4 text-text-disabled mx-auto" />
                        ) : isActive && isPlaying ? (
                          <NowPlayingBars />
                        ) : downloadingIds.has(track.videoId) ? (
                          <DownloadingSpinner />
                        ) : (
                          <>
                            <span className="text-text-disabled text-sm group-hover:opacity-0">{idx + 1}</span>
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Play className="w-3.5 h-3.5 fill-text text-text" />
                            </div>
                          </>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 aspect-square rounded-[4px] overflow-hidden shrink-0">
                            <img
                              src={getTrackThumbnailUrl(track)}
                              alt={track.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className={`text-sm font-medium truncate ${isActive ? 'text-accent' : 'text-text'}`}>
                              {track.title}
                            </p>
                            <p className="text-xs text-text-muted whitespace-normal break-words">{artist}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 max-w-0 overflow-hidden">
                        <span className="block text-sm text-text-muted whitespace-normal break-words">{artist}</span>
                      </td>
                      <td className="playlist-date-column py-2.5 px-3 text-right max-w-0 overflow-hidden">
                        <span className="block text-sm text-text-disabled whitespace-nowrap">
                          {track.dateAdded || playlist.importedAt || playlist.createdAt ? formatRelativeDate(track.dateAdded || playlist.importedAt || playlist.createdAt!) : '—'}
                        </span>
                      </td>
                      <td className="playlist-time-column py-2.5 px-3 text-right">
                        <span className="text-sm text-text-disabled">
                          {track.duration ? formatDuration(track.duration) : '–'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center w-12">
                        {!isEditOrder && onAddToQueue && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (contextMenu) {
                                contextMenuAnchorRef.current = null;
                                setContextMenu(null);
                                return;
                              }
                              const rect = e.currentTarget.getBoundingClientRect();
                              contextMenuAnchorRef.current = e.currentTarget;
                              setContextMenu({ track, x: rect.right, y: rect.bottom });
                            }}
                            className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-surface-hover transition-all opacity-0 group-hover:opacity-100"
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

          {!loading && !error && visibleRecommendations.length > 0 && !trackSearchQuery && (
            <section className="mt-8 border-t border-border pt-6 pb-8">
              <h2 className="mb-4 text-xl font-bold tracking-tight text-text">Suggestions</h2>
              <div className="space-y-1">
                {visibleRecommendations.map((track) => (
                  <div key={track.videoId} className="group flex min-h-16 items-center gap-4 rounded-xl px-3 py-2 hover:bg-surface-hover transition-colors">
                    <img
                      src={getThumbnailUrl(track.videoId, track.title)}
                      alt={track.title}
                      className="h-12 w-12 aspect-square rounded-lg object-cover shadow-lg"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text">{track.title}</p>
                      <p className="mt-0.5 truncate text-xs text-text-muted">{cleanArtistName(track.artist)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setVisibleRecommendations((prev) => prev.filter((item) => item.videoId !== track.videoId));
                        void handleAddTrackLocal(track, playlist.id);
                      }}
                      aria-label={`Add ${track.title} to playlist`}
                      title="Add to playlist"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-all hover:bg-surface-hover hover:text-text"
                    >
                      <ListPlus className="h-6 w-6" strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
      {contextMenu && onPlayNext && onAddToPlaylist && onRemoveFromPlaylist && onSetSleepTimer && onOpenSleepTimer && (
        <SongContextMenu
          track={contextMenu.track}
          playlists={playlists}
          anchorRef={contextMenuAnchorRef}
          boundaryRef={playlistViewRef}
          x={contextMenu.x}
          y={contextMenu.y}
          onPlayNext={onPlayNext}
          onAddToQueue={onAddToQueue ?? (() => {})}
          onAddToPlaylist={handleAddTrackLocal}
          onRemoveFromPlaylist={handleRemoveTrackLocal}
          playlistId={playlist.id}
          onSetSleepTimer={onSetSleepTimer}
          onOpenSleepTimer={onOpenSleepTimer}
          onDownloadTrack={onDownloadTrack ? handleDownloadTrack : undefined}
          onDeleteTrack={onDeleteTrack ? handleDeleteTrack : undefined}
          onSetMatchOverride={onSetMatchOverride}
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
      {['music-bar-random-a', 'music-bar-random-b', 'music-bar-random-c', 'music-bar-random-d'].map((barClass) => (
        <div
          key={barClass}
          className={`w-[2px] bg-accent rounded-xl ${barClass}`}
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
        className="w-4 h-4 animate-spin text-accent"
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

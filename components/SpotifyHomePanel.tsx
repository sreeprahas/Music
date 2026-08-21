'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { Playlist } from '@/types';
import { Disc3, Loader2, Music, Play, RefreshCw, Radio, LogOut } from 'lucide-react';
import { Skeleton } from './Skeleton';

interface Props {
  onSelectPlaylist: (playlistId: string) => void;
  onPlayPlaylist?: (playlistId: string) => void;
  onOpenSettings?: () => void;
  spotifyConnected?: boolean;
  onConnectSpotify?: () => void;
  onDisconnectSpotify?: () => Promise<void> | void;
}

export function SpotifyHomePanel({
  onSelectPlaylist,
  onPlayPlaylist,
  onOpenSettings,
  spotifyConnected: initialConnected,
  onConnectSpotify,
  onDisconnectSpotify,
}: Props) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [connected, setConnected] = useState<boolean>(initialConnected ?? false);
  const [profile, setProfile] = useState<{ display_name?: string; images?: Array<{ url: string }> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState('');
  const connectedRef = useRef(connected);
  const playlistsRef = useRef(playlists);
  const errorRef = useRef(error);

  useEffect(() => { connectedRef.current = connected; }, [connected]);
  useEffect(() => { playlistsRef.current = playlists; }, [playlists]);
  useEffect(() => { errorRef.current = error; }, [error]);

  const checkStatusAndLoad = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Check auth status
      const statusRes = await fetch('/api/auth/spotify/status', { cache: 'no-store' });
      const statusData = await statusRes.json().catch(() => ({ connected: false }));
      const isConn = Boolean(statusData.connected);
      setConnected(isConn);

      if (isConn) {
        // 2. Fetch playlists and profile in parallel
        const [plRes, profileRes] = await Promise.all([
          fetch('/api/spotify/playlists', { cache: 'no-store' }),
          fetch('/api/spotify/profile', { cache: 'no-store' }).catch(() => null),
        ]);

        if (!plRes.ok) {
          throw new Error("Couldn't load your playlists.");
        }

        const plData = await plRes.json().catch(() => ({ playlists: [] }));
        const rawPlaylists = Array.isArray(plData?.playlists) ? plData.playlists : [];
        setPlaylists(rawPlaylists);

        if (profileRes && profileRes.ok) {
          const profData = await profileRes.json().catch(() => ({}));
          setProfile(profData?.profile || null);
        }
      } else {
        setPlaylists([]);
        setProfile(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your playlists.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void checkStatusAndLoad();

    // Check for query param if just redirected back from OAuth
    const params = new URLSearchParams(window.location.search);
    const authResult = params.get('spotify_auth');
    if (authResult === 'ok') {
      window.history.replaceState({}, '', window.location.pathname);
      void checkStatusAndLoad();
    }
    const retryTimer = window.setInterval(() => {
      // The worker may still be starting when the first render happens. Also
      // retry a failed/empty library load so the home page recovers without a
      // manual refresh.
      if (!connectedRef.current || errorRef.current || playlistsRef.current.length === 0) {
        void checkStatusAndLoad();
      }
    }, 2500);
    return () => window.clearInterval(retryTimer);
  }, []);

  // Dashboard status is resolved asynchronously after the worker restores its
  // saved session. Keep the panel in sync instead of freezing the initial
  // disconnected value from the first render.
  useEffect(() => {
    if (initialConnected === undefined) return;
    setConnected(initialConnected);
    if (initialConnected) void checkStatusAndLoad();
  }, [initialConnected]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      if (onConnectSpotify) {
        await onConnectSpotify();
      } else if (window.electron?.openSpotApiPopup) {
        const result = await window.electron.openSpotApiPopup();
        if (result.connected) await checkStatusAndLoad();
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      if (onDisconnectSpotify) {
        await onDisconnectSpotify();
      } else {
        await fetch('/api/auth/spotify/disconnect', { method: 'POST' });
      }
      setConnected(false);
      setPlaylists([]);
      setProfile(null);
    } finally {
      setDisconnecting(false);
    }
  };

  // 1. Logged Out State: Clean, intentional banner focusing on playlist library access
  if (!loading && !connected) {
    return (
      <section className="flex flex-col items-center justify-center min-h-[70vh] px-6 py-12 text-center animate-fadeIn select-none">
        <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-accent/10 border border-accent/20 shadow-2xl shadow-accent/10">
          <Radio className="h-12 w-12 text-accent" />
          <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-background">
            <Music className="h-4 w-4" />
          </div>
        </div>

        <p className="text-xs uppercase tracking-[0.24em] text-accent font-semibold mb-2">Spotify Library</p>
        <h2 className="text-3xl font-black text-text sm:text-4xl tracking-tight max-w-md">
          Your Spotify Playlists
        </h2>
        <p className="mt-3 text-sm text-text-muted max-w-md leading-relaxed">
          Connect Spotify to access your playlists, import your music, and listen with unified playback.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="flex items-center gap-2.5 rounded-2xl bg-accent px-7 py-3.5 text-sm font-bold text-background shadow-lg shadow-accent/20 hover:bg-accent-hover hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-50 cursor-pointer"
          >
            {connecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting to Spotify...
              </>
            ) : (
              <>
                <Radio className="h-4 w-4" />
                Connect Spotify
              </>
            )}
          </button>

          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="rounded-2xl border border-border px-5 py-3.5 text-xs font-semibold text-text-secondary hover:bg-surface hover:text-text transition-all duration-300"
            >
              Configure Settings
            </button>
          )}
        </div>
      </section>
    );
  }

  // 2. Loading State: Proper skeleton grid
  if (loading) {
    return (
      <section className="px-8 py-8 animate-fadeIn select-none space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-4 w-32 rounded-md mb-2" />
            <Skeleton className="h-8 w-64 rounded-lg" />
          </div>
          <Skeleton className="h-9 w-24 rounded-xl" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex flex-col space-y-3">
              <Skeleton className="aspect-square w-full rounded-2xl" />
              <Skeleton className="h-4 w-3/4 rounded-md" />
              <Skeleton className="h-3 w-1/2 rounded-md" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // 3. Error State: User-friendly message with retry
  if (error) {
    return (
      <section className="flex flex-col items-center justify-center min-h-[60vh] px-6 py-12 text-center animate-fadeIn">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-error/10 text-error mb-4 border border-error/20">
          <Disc3 className="h-8 w-8" />
        </div>
        <h3 className="text-xl font-bold text-text mb-2">Couldn't load your playlists</h3>
        <p className="text-sm text-text-muted max-w-sm mb-6">{error}</p>
        <button
          type="button"
          onClick={() => void checkStatusAndLoad()}
          className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-xs font-bold text-background hover:bg-accent-hover transition-all"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </button>
      </section>
    );
  }

  // 4. Logged-in State: Spotify Playlists Grid
  return (
    <section className="px-8 py-8 animate-fadeIn select-none">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-accent font-semibold">Spotify Library</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-black text-text tracking-tight">
            {profile?.display_name ? `${profile.display_name}'s Playlists` : 'Your Spotify Playlists'}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-text-muted">
            {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'} available in your library
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void checkStatusAndLoad()}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-xs font-semibold text-text-secondary hover:border-accent/40 hover:text-accent disabled:opacity-50 transition-all cursor-pointer"
            title="Refresh playlists"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="flex items-center gap-1.5 rounded-xl border border-border/60 px-3 py-2 text-xs font-medium text-text-muted hover:border-error/30 hover:text-error hover:bg-error/5 disabled:opacity-50 transition-all cursor-pointer"
            title="Disconnect Spotify"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Disconnect</span>
          </button>
        </div>
      </div>

      {/* Empty State */}
      {playlists.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] rounded-3xl border border-dashed border-border bg-background-secondary/50 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface border border-border text-text-muted mb-4">
            <Music className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-text mb-1">No playlists yet</h3>
          <p className="text-xs text-text-muted max-w-sm">
            Your connected Spotify account does not have any playlists yet, or none have been synchronized.
          </p>
        </div>
      ) : (
        /* Responsive Playlist Grid */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
          {playlists.map((playlist) => (
            <PlaylistCardItem
              key={playlist.id}
              playlist={playlist}
              onSelect={() => onSelectPlaylist(playlist.id)}
              onPlay={onPlayPlaylist ? () => onPlayPlaylist(playlist.id) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PlaylistCardItem({
  playlist,
  onSelect,
  onPlay,
}: {
  playlist: Playlist;
  onSelect: () => void;
  onPlay?: () => void;
}) {
  const [playPressed, setPlayPressed] = useState(false);
  const coverUrl = playlist.thumbnailUrl || playlist.thumbnailUrls?.[0];

  return (
    <div
      onClick={onSelect}
      className="group text-left cursor-pointer relative flex flex-col rounded-2xl bg-surface/50 border border-border-subtle p-3 hover:bg-surface hover:border-accent/30 hover:shadow-xl hover:shadow-accent/5 transition-all duration-300 ease-out"
    >
      {/* Cover Artwork Container */}
      <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-background-secondary mb-3 shadow-md border border-border/40">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={playlist.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-accent/10 text-accent">
            <Music className="h-8 w-8" />
          </div>
        )}

        {/* Hover Gradient Overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {/* Floating Quick Play Button */}
        {onPlay && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPlayPressed(true);
              setTimeout(() => setPlayPressed(false), 140);
              onPlay();
            }}
            aria-label={`Play ${playlist.title}`}
            className={`absolute bottom-2.5 right-2.5 z-20 opacity-0 group-hover:opacity-100 transition-all duration-200 ${
              playPressed ? 'scale-90' : 'scale-100 hover:scale-105'
            }`}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-background shadow-xl hover:bg-accent-hover transition-colors">
              <Play className="h-4 w-4 fill-background ml-0.5" />
            </div>
          </button>
        )}
      </div>

      {/* Playlist Meta */}
      <p className="text-sm font-bold text-text truncate group-hover:text-accent transition-colors">
        {playlist.title}
      </p>
      <p className="mt-1 text-xs text-text-muted truncate">
        {playlist.trackCount > 0
          ? `Spotify • ${playlist.trackCount} ${playlist.trackCount === 1 ? 'track' : 'tracks'}`
          : 'Spotify playlist'}
      </p>
    </div>
  );
}

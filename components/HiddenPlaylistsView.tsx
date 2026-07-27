'use client';

import React, { useState } from 'react';
import type { Playlist } from '@/types';
import { Eye, EyeOff, FolderLock, Trash2, Upload, Loader2 } from 'lucide-react';

interface Props {
  playlists: Playlist[];
  hiddenIds: string[];
  onSelect: (id: string) => void;
  onToggleHidden: (id: string) => void;
  onDeletePlaylist?: (id: string) => Promise<void>;
  onPushPlaylist?: (playlist: Playlist) => Promise<void>;
}

export function HiddenPlaylistsView({
  playlists,
  hiddenIds,
  onSelect,
  onToggleHidden,
  onDeletePlaylist,
  onPushPlaylist,
}: Props) {
  const hiddenSet = new Set(hiddenIds);
  const hiddenPlaylists = playlists.filter((playlist) => hiddenSet.has(playlist.id));
  const visiblePlaylists = playlists.filter((playlist) => !hiddenSet.has(playlist.id));

  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'delete' | 'push' | null>(null);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!onDeletePlaylist) return;
    if (!confirm('Are you sure you want to delete this playlist?')) return;
    setLoadingActionId(id);
    setActionType('delete');
    try {
      await onDeletePlaylist(id);
    } finally {
      setLoadingActionId(null);
      setActionType(null);
    }
  };

  const handlePush = async (e: React.MouseEvent, playlist: Playlist) => {
    e.stopPropagation();
    if (!onPushPlaylist) return;
    setLoadingActionId(playlist.id);
    setActionType('push');
    try {
      await onPushPlaylist(playlist);
    } finally {
      setLoadingActionId(null);
      setActionType(null);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-8 select-none scrollbar-thin">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center">
            <FolderLock className="w-5 h-5 text-[#00F2FE]" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Hidden Playlists</h1>
            <p className="text-sm text-white/35">Playlists you have tucked away from the sidebar.</p>
          </div>
        </div>

        {hiddenPlaylists.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center text-white/35">
            Nothing is hidden yet.
          </div>
        ) : (
          <div className="space-y-3">
            {hiddenPlaylists.map((playlist) => (
              <div
                key={playlist.id}
                className="w-full flex items-center gap-4 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-left hover:bg-white/[0.04] transition-colors"
              >
                <button className="flex items-center gap-4 min-w-0 flex-1 text-left" onClick={() => onSelect(playlist.id)}>
                  <div className="w-14 h-14 rounded-2xl overflow-hidden bg-white/5 shrink-0">
                    {playlist.thumbnailUrl ? (
                      <img src={`/api/playlist-thumbnail?playlistId=${encodeURIComponent(playlist.id)}&url=${encodeURIComponent(playlist.thumbnailUrl)}`} alt={playlist.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#00F2FE]/20 to-[#1a1a2e]">
                        <FolderLock className="w-5 h-5 text-white/40" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-white truncate">{playlist.title}</p>
                    <p className="text-xs text-white/35 truncate">{playlist.trackCount} tracks</p>
                  </div>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => handlePush(e, playlist)}
                    disabled={loadingActionId === playlist.id}
                    className="flex items-center justify-center gap-1.5 rounded-2xl border border-purple-500/40 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 px-4 py-2 text-sm font-medium transition-all"
                    title="Push playlist to YouTube Music"
                  >
                    {loadingActionId === playlist.id && actionType === 'push' ? (
                      <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                    ) : (
                      <Upload className="w-4 h-4 text-purple-400" />
                    )}
                    Push
                  </button>

                  <button
                    onClick={() => onToggleHidden(playlist.id)}
                    className="flex items-center justify-center gap-2 rounded-2xl border border-[#00F2FE]/40 bg-[#00F2FE]/10 text-[#00F2FE] hover:bg-[#00F2FE]/20 px-5 py-2 text-sm font-medium transition-all"
                    title="Unhide playlist"
                  >
                    <Eye className="w-4 h-4 text-[#00F2FE]" />
                    Unhide
                  </button>

                  {playlist.id !== 'LL' && (
                    <button
                      onClick={(e) => handleDelete(e, playlist.id)}
                      disabled={loadingActionId === playlist.id}
                      className="flex items-center justify-center gap-1.5 rounded-2xl border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 px-4 py-2 text-sm font-medium transition-all"
                      title="Delete playlist"
                    >
                      {loadingActionId === playlist.id && actionType === 'delete' ? (
                        <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                      ) : (
                        <Trash2 className="w-4 h-4 text-red-400" />
                      )}
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 grid gap-3">
          {visiblePlaylists.map((playlist) => (
            <div
              key={playlist.id}
              className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.01] px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-white/85 truncate">{playlist.title}</p>
                <p className="text-xs text-white/30 truncate">Visible in the sidebar</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => handlePush(e, playlist)}
                  disabled={loadingActionId === playlist.id}
                  className="flex items-center justify-center gap-1.5 rounded-2xl border border-purple-500/40 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 px-4 py-2 text-sm font-medium transition-all"
                  title="Push playlist to YouTube Music"
                >
                  {loadingActionId === playlist.id && actionType === 'push' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                  ) : (
                    <Upload className="w-4 h-4 text-purple-400" />
                  )}
                  Push
                </button>

                <button
                  onClick={() => onToggleHidden(playlist.id)}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-5 py-2 text-sm text-white/70 hover:text-white hover:border-white/20 transition-all"
                >
                  <EyeOff className="w-4 h-4" />
                  Hide
                </button>

                {playlist.id !== 'LL' && (
                  <button
                    onClick={(e) => handleDelete(e, playlist.id)}
                    disabled={loadingActionId === playlist.id}
                    className="flex items-center justify-center gap-1.5 rounded-2xl border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 px-4 py-2 text-sm font-medium transition-all"
                    title="Delete playlist"
                  >
                    {loadingActionId === playlist.id && actionType === 'delete' ? (
                      <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                    ) : (
                      <Trash2 className="w-4 h-4 text-red-400" />
                    )}
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


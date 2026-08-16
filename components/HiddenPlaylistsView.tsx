'use client';

import React, { useState } from 'react';
import type { Playlist } from '@/types';
import { FolderLock, Trash2, Loader2, Check } from 'lucide-react';

interface Props {
  playlists: Playlist[];
  importedIds: string[];
  onSelect: (id: string) => void;
  onToggleImport: (id: string) => void;
  onDone: () => void;
  onDeletePlaylist?: (id: string) => Promise<void>;
}

export function PlaylistManagementView({
  playlists,
  importedIds,
  onSelect,
  onToggleImport,
  onDone,
  onDeletePlaylist,
}: Props) {
  const importedSet = new Set(importedIds);

  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'delete' | null>(null);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!onDeletePlaylist) return;
    if (!confirm('Remove this playlist from the local library? Your YouTube Music playlist will not be changed.')) return;
    setLoadingActionId(id);
    setActionType('delete');
    try {
      await onDeletePlaylist(id);
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
            <h1 className="text-2xl font-black text-white tracking-tight">Playlist Management</h1>
            <p className="text-sm text-white/35">Choose the YouTube Music playlists to import into your local library.</p>
          </div>
        </div>

        {playlists.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center text-white/35">
            No playlists are available. Sign in and refresh to load them.
          </div>
        ) : (
          <div className="space-y-3">
            {playlists.map((playlist) => (
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
                  <button onClick={() => onToggleImport(playlist.id)} className={`flex items-center justify-center gap-2 rounded-2xl border px-5 py-2 text-sm font-medium transition-all ${importedSet.has(playlist.id) ? 'border-[#00F2FE]/40 bg-[#00F2FE]/10 text-[#00F2FE]' : 'border-white/10 text-white/70 hover:text-white hover:border-white/20'}`} title={importedSet.has(playlist.id) ? 'Remove from local library' : 'Import playlist'}>
                    {importedSet.has(playlist.id) && <Check className="w-4 h-4" />}
                    {importedSet.has(playlist.id) ? 'Imported' : 'Import'}
                  </button>

                  {playlist.id !== 'LL' && (
                    <button
                      onClick={(e) => handleDelete(e, playlist.id)}
                      disabled={loadingActionId === playlist.id}
                      className="flex items-center justify-center gap-1.5 rounded-2xl border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 px-4 py-2 text-sm font-medium transition-all"
                      title="Remove local playlist metadata"
                    >
                      {loadingActionId === playlist.id && actionType === 'delete' ? (
                        <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                      ) : (
                        <Trash2 className="w-4 h-4 text-red-400" />
                      )}
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
      <div className="shrink-0 flex justify-end border-t border-white/10 bg-[#101010] px-8 py-4">
        <button onClick={onDone} className="rounded-xl bg-[#00F2FE] px-6 py-2.5 text-sm font-bold text-black hover:bg-[#7DFAFF] transition-colors">Done</button>
      </div>
    </div>
  );
}


'use client';

import React, { useState } from 'react';
import type { Playlist, Track } from '@/types';
import { FolderLock, Trash2 } from 'lucide-react';
import { PlaylistArtwork } from './PlaylistArtwork';
import { getThumbnailUrl } from '@/lib/ytmusicFormat';

interface Props {
  playlists: Playlist[];
  importedIds: string[];
  onToggleImport: (id: string) => void;
  onDone?: () => void;
  showDone?: boolean;
}

export function PlaylistManagementView({
  playlists,
  importedIds,
  onToggleImport,
  onDone,
  showDone = false,
}: Props) {
  const importedSet = new Set(importedIds);

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewTracks, setPreviewTracks] = useState<Track[]>([]);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const previewPlaylist = playlists.find((playlist) => playlist.id === previewId) || null;
  React.useEffect(() => {
    if (!previewId) { setPreviewTracks([]); setPreviewLoaded(false); return; }
    setPreviewLoaded(false);
    let cancelled = false;
    fetch(`/api/playlist?playlistId=${encodeURIComponent(previewId)}&limit=10&preview=1`, { cache: 'no-store' }).then((response) => response.ok ? response.json() : null).then((data) => { if (!cancelled) { setPreviewTracks(Array.isArray(data?.tracks) ? data.tracks.slice(0, 10) : []); setPreviewLoaded(true); } }).catch(() => { if (!cancelled) { setPreviewTracks([]); setPreviewLoaded(true); } });
    return () => { cancelled = true; };
  }, [previewId]);
  React.useEffect(() => {
    let cancelled = false;
    void Promise.all(playlists.filter((playlist) => playlist.id !== 'LL' && playlist.id !== previewId).map((playlist) => fetch(`/api/playlist?playlistId=${encodeURIComponent(playlist.id)}&limit=10&preview=1`, { cache: 'no-store' }).catch(() => null)));
    return () => { cancelled = true; };
  }, [playlists, previewId]);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-8 select-none scrollbar-thin">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-surface border border-border-subtle flex items-center justify-center">
            <FolderLock className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-text tracking-tight">Playlist Management</h1>
            <p className="text-sm text-text-muted">Choose the YouTube Music playlists to import into your local library.</p>
          </div>
          </div>

        {playlists.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-background-secondary p-10 text-center text-text-muted">
            No imported playlists yet.
          </div>
        ) : (
          <div className="space-y-3">
            {playlists.filter((playlist) => playlist.id !== 'LL').map((playlist) => (
              <div
                key={playlist.id}
                className="w-full flex flex-wrap items-center gap-4 rounded-2xl border border-border-subtle bg-background-secondary px-4 py-3 text-left hover:bg-surface-hover transition-colors"
              >
                <button className="flex items-center gap-4 min-w-0 flex-1 text-left" onClick={() => setPreviewId((current) => current === playlist.id ? null : playlist.id)}>
                  <div className="h-14 w-14 rounded-2xl overflow-hidden bg-surface shrink-0"><PlaylistArtwork playlist={playlist} /></div>

                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-text truncate">{playlist.title}</p>
                    <p className="text-xs text-text-muted truncate">{playlist.trackCount} tracks</p>
                  </div>
                </button>

                <div className="flex items-center gap-2">
                  <button onClick={() => onToggleImport(playlist.id)} className={`flex items-center justify-center gap-2 rounded-2xl border px-5 py-2 text-sm font-medium transition-all ${importedSet.has(playlist.id) ? 'border-border-strong bg-surface text-text-secondary hover:text-text' : 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20'}`} title={importedSet.has(playlist.id) ? 'Remove from local library' : 'Import playlist'}>
                    {importedSet.has(playlist.id) && <Trash2 className="w-4 h-4" />}
                    {importedSet.has(playlist.id) ? 'Remove' : 'Import'}
                  </button>

                </div>
                {previewPlaylist?.id === playlist.id && previewLoaded && (
                  <div className="playlist-preview-expand order-3 w-full rounded-xl border-t border-border pt-3">
                    <div className="mb-2 flex items-center gap-2"><span className="font-semibold text-text">Preview</span><span className="text-xs text-text-muted">{previewTracks.length} songs</span></div>
                    <div className="space-y-1">{previewTracks.map((track, index) => <div key={`${track.videoId}-${index}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5"><span className="w-5 text-xs text-text-disabled">{index + 1}</span><img src={getThumbnailUrl(track.videoId, track.title)} alt="" className="h-8 w-8 rounded object-cover" /><span className="truncate text-sm text-text-secondary">{track.title}</span></div>)}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
      {showDone && onDone && <div className="shrink-0 flex justify-end border-t border-border bg-surface px-8 py-4"><button onClick={onDone} className="rounded-xl bg-accent px-6 py-2.5 text-sm font-bold text-background hover:bg-accent-hover transition-colors">Done</button></div>}
    </div>
  );
}


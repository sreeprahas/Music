import React, { useState } from 'react';
import { X, Link as LinkIcon, Loader2, Sparkles, Check, Music } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { Track } from '../types';

interface AddTrackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddTrackModal: React.FC<AddTrackModalProps> = ({ isOpen, onClose }) => {
  const { library, addTrackByUrlOrSearch } = usePlayer();
  const [urlInput, setUrlInput] = useState<string>('');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('');
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [previewTrack, setPreviewTrack] = useState<Track | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleResolve = async () => {
    if (!urlInput.trim()) return;
    try {
      setIsResolving(true);
      setErrorMsg(null);
      setPreviewTrack(null);

      const res = await fetch(`/api/resolve-track?url=${encodeURIComponent(urlInput.trim())}`);
      const data = await res.json();

      if (!res.ok || !data.track) {
        throw new Error(data.message || 'Failed to extract track metadata via yt-dlp');
      }

      setPreviewTrack(data.track);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error extracting track info');
    } fontFinally: {
      setIsResolving(false);
    }
  };

  const handleSaveTrack = async () => {
    if (!urlInput.trim()) return;
    try {
      setIsSaving(true);
      setErrorMsg(null);

      await addTrackByUrlOrSearch(urlInput.trim(), selectedPlaylistId || undefined);

      setSuccessMsg(true);
      setTimeout(() => {
        setSuccessMsg(false);
        setUrlInput('');
        setPreviewTrack(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save track to library');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#181818] border border-white/10 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-600/20 text-red-400 flex items-center justify-center">
              <LinkIcon className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-white text-base">Add Track via YouTube Link</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-full text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-400 mb-1.5 uppercase tracking-wider">
              YouTube Video URL or ID
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... or ID"
                className="flex-1 h-11 bg-[#242424] border border-white/10 rounded-xl px-4 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-red-500"
              />
              <button
                onClick={handleResolve}
                disabled={isResolving || !urlInput.trim()}
                className="px-4 bg-[#333] hover:bg-[#444] text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isResolving ? <Loader2 className="w-4 h-4 animate-spin text-red-400" /> : <Sparkles className="w-4 h-4" />}
                <span>Fetch Info</span>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-900/30 border border-red-500/40 rounded-xl text-xs text-red-300">
              {errorMsg}
            </div>
          )}

          {/* Preview Track */}
          {previewTrack && (
            <div className="bg-[#222] border border-white/10 rounded-xl p-3 flex items-center gap-3">
              <img
                src={previewTrack.thumbnailUrl}
                alt={previewTrack.title}
                className="w-16 h-12 object-cover rounded-lg shrink-0"
              />
              <div className="flex-1 overflow-hidden">
                <div className="font-semibold text-sm text-white truncate">{previewTrack.title}</div>
                <div className="text-xs text-neutral-400 truncate">{previewTrack.artist}</div>
                <div className="text-[10px] text-neutral-500 font-mono mt-0.5">{previewTrack.durationFormatted}</div>
              </div>
            </div>
          )}

          {/* Playlist Selector */}
          <div>
            <label className="block text-xs font-semibold text-neutral-400 mb-1.5 uppercase tracking-wider">
              Add to Playlist (Optional)
            </label>
            <select
              value={selectedPlaylistId}
              onChange={(e) => setSelectedPlaylistId(e.target.value)}
              className="w-full h-11 bg-[#242424] border border-white/10 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-red-500"
            >
              <option value="">Library / All Songs</option>
              {library?.playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.trackIds.length} tracks)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-semibold text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveTrack}
            disabled={isSaving || !urlInput.trim()}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl text-xs flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : successMsg ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : (
              <Music className="w-4 h-4" />
            )}
            <span>{successMsg ? 'Saved to JSON!' : 'Save Track via yt-dlp'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

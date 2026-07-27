import React, { useState } from 'react';
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
    } finally {
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-[#201f1f] border border-white/10 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ff5540]">add_circle</span>
            <h3 className="font-bold text-[#e5e2e1] text-base">Add Track via YouTube Link</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-full text-[#ebbbb4]/60 hover:text-white transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="py-4 space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-[#ebbbb4]/60 mb-1.5 uppercase tracking-wider">
              YouTube Video URL or ID
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... or ID"
                className="flex-1 h-11 bg-[#252525] border border-white/10 rounded-xl px-4 text-sm text-[#e5e2e1] placeholder:text-[#ebbbb4]/40 focus:outline-none focus:border-[#ff5540]"
              />
              <button
                onClick={handleResolve}
                disabled={isResolving || !urlInput.trim()}
                className="px-4 bg-[#353534] hover:bg-[#454747] text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {isResolving ? 'sync' : 'search'}
                </span>
                <span>Fetch Info</span>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-[#93000a]/30 border border-red-500/40 rounded-xl text-xs text-[#ffdad6]">
              {errorMsg}
            </div>
          )}

          {/* Preview Track */}
          {previewTrack && (
            <div className="bg-[#252525] border border-white/10 rounded-xl p-3 flex items-center gap-3">
              <img
                src={previewTrack.thumbnailUrl}
                alt={previewTrack.title}
                className="w-16 h-12 object-cover rounded-lg shrink-0"
              />
              <div className="flex-1 overflow-hidden">
                <div className="font-bold text-sm text-[#e5e2e1] truncate">{previewTrack.title}</div>
                <div className="text-xs text-[#ebbbb4]/60 truncate">{previewTrack.artist}</div>
                <div className="text-[10px] text-[#ebbbb4]/40 font-mono mt-0.5">{previewTrack.durationFormatted}</div>
              </div>
            </div>
          )}

          {/* Playlist Selector */}
          <div>
            <label className="block text-[11px] font-bold text-[#ebbbb4]/60 mb-1.5 uppercase tracking-wider">
              Add to Playlist (Optional)
            </label>
            <select
              value={selectedPlaylistId}
              onChange={(e) => setSelectedPlaylistId(e.target.value)}
              className="w-full h-11 bg-[#252525] border border-white/10 rounded-xl px-4 text-sm text-[#e5e2e1] focus:outline-none focus:border-[#ff5540]"
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
            className="px-4 py-2.5 text-xs font-semibold text-[#ebbbb4]/60 hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveTrack}
            disabled={isSaving || !urlInput.trim()}
            className="px-5 py-2.5 bg-[#ff5540] hover:bg-[#ff5540]/90 text-white font-bold rounded-xl text-xs flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 shadow-lg shadow-[#ff5540]/20"
          >
            <span className="material-symbols-outlined text-[18px]">
              {isSaving ? 'sync' : successMsg ? 'check_circle' : 'add'}
            </span>
            <span>{successMsg ? 'Saved to JSON!' : 'Save Track via yt-dlp'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};


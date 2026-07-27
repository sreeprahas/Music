'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { DownloadProgressEvent } from '@/types';

interface CompletedTrack {
  videoId: string;
  title: string;
  status: 'done' | 'error';
}

interface Props {
  playlistId: string;
  playlistTitle: string;
  onComplete: () => void;
}

export function DownloadProgress({ playlistId, playlistTitle, onComplete }: Props) {
  const [phase, setPhase] = useState<'connecting' | 'downloading' | 'done' | 'error'>('connecting');
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [currentTrack, setCurrentTrack] = useState<{ title: string; artist?: string; thumbnailUrl?: string } | null>(null);
  const [completed, setCompleted] = useState<CompletedTrack[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/download?playlistId=${encodeURIComponent(playlistId)}`);
    esRef.current = es;
    let completed = false; // track clean completion to suppress false onerror

    es.onmessage = (event) => {
      const data = JSON.parse(event.data) as DownloadProgressEvent;

      if (data.type === 'start') {
        setTotal(data.toDownload ?? 0);
        if (data.toDownload === 0) {
          setPhase('done');
          completed = true;
          setTimeout(onComplete, 1500);
        } else {
          setPhase('downloading');
        }
      } else if (data.type === 'progress') {
        setCurrent(data.current ?? 0);
        if (data.status === 'downloading') {
          setCurrentTrack({
            title: data.title ?? '',
            artist: data.artist,
            thumbnailUrl: data.thumbnailUrl,
          });
        } else if (data.status === 'done' || data.status === 'error') {
          setCompleted((prev) => [
            { videoId: data.videoId ?? '', title: data.title ?? '', status: data.status as 'done' | 'error' },
            ...prev,
          ]);
          setTimeout(() => {
            listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          }, 50);
        }
      } else if (data.type === 'complete') {
        completed = true;
        setPhase('done');
        setCurrentTrack(null);
        setTimeout(onComplete, 2000);
      } else if (data.type === 'error') {
        setPhase('error');
        setErrorMsg(data.message ?? 'Download failed');
      }
    };

    es.onerror = () => {
      // SSE fires onerror when the server closes the stream â€” only treat it as
      // an actual error if we never received a 'complete' event
      if (!completed) {
        setPhase('error');
        setErrorMsg('Connection to download server lost.');
      }
      es.close();
    };

    return () => {
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId]);


  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="absolute inset-0 z-20 bg-[#0a0a0a]/95 backdrop-blur-md flex flex-col items-center justify-start pt-16 px-8">
      {/* Animated waveform */}
      <div className="flex items-end gap-[3px] h-10 mb-8">
        {Array.from({ length: 28 }).map((_, i) => (
          <div
            key={i}
            className="w-[3px] rounded-full"
            style={{
              background: phase === 'done' ? '#00F2FE' : 'rgba(0,242,254,0.6)',
              height: phase === 'downloading'
                ? `${20 + Math.sin((i / 28) * Math.PI * 2) * 16}px`
                : '4px',
              animation: phase === 'downloading' ? `wave ${0.8 + (i % 5) * 0.12}s ease-in-out ${(i * 0.04).toFixed(2)}s infinite alternate` : 'none',
              transition: 'height 0.4s ease',
            }}
          />
        ))}
      </div>

      {/* Status text */}
      <h2 className="text-2xl font-bold text-white mb-1">
        {phase === 'connecting' && 'Connectingâ€¦'}
        {phase === 'downloading' && 'Downloading'}
        {phase === 'done' && 'All Done'}
        {phase === 'error' && 'Download Error'}
      </h2>
      <p className="text-sm text-white/40 mb-8">{playlistTitle}</p>

      {/* Current track */}
      {currentTrack && phase === 'downloading' && (
        <div className="flex items-center gap-4 w-full max-w-sm mb-6 bg-white/5 rounded-xl p-3">
          {currentTrack.thumbnailUrl && (
            <img
              src={currentTrack.thumbnailUrl}
              alt={currentTrack.title}
              className="w-12 h-12 rounded-lg object-cover shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{currentTrack.title}</p>
            {currentTrack.artist && (
              <p className="text-xs text-white/40 truncate">{currentTrack.artist}</p>
            )}
          </div>
          <div className="w-5 h-5 rounded-full border-2 border-[#00F2FE]/40 border-t-[#00F2FE] animate-spin shrink-0" />
        </div>
      )}

      {/* Progress bar */}
      {total > 0 && (
        <div className="w-full max-w-sm mb-2">
          <div className="flex justify-between text-xs text-white/40 mb-2">
            <span>{current} of {total} songs</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#00F2FE] rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Error message */}
      {phase === 'error' && (
        <div className="text-sm text-red-400 mt-4 text-center max-w-xs">
          {errorMsg}
          <button
            onClick={onComplete}
            className="block mx-auto mt-4 px-5 py-2 rounded-full border border-white/20 text-white/60 hover:text-white text-sm transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Done state */}
      {phase === 'done' && total === 0 && (
        <p className="text-sm text-white/40 mt-2">All tracks were already downloaded.</p>
      )}

      {/* Completed list */}
      {completed.length > 0 && (
        <div
          ref={listRef}
          className="w-full max-w-sm mt-6 max-h-52 overflow-y-auto space-y-1 scrollbar-thin"
        >
          {completed.map((t, i) => (
            <div key={`${t.videoId}-${i}`} className="flex items-center gap-2.5 py-1.5 px-1">
              <div
                className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                  t.status === 'done' ? 'bg-[#00F2FE]/20' : 'bg-red-500/20'
                }`}
              >
                {t.status === 'done' ? (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="#00F2FE">
                    <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
                  </svg>
                ) : (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="#ef4444">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                )}
              </div>
              <p className="text-xs text-white/50 truncate">{t.title}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

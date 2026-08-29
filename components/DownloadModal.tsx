'use client';

import React, { useState } from 'react';
import type { DownloadJob } from '@/types';
import {
  X,
  Download,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  XCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface Props {
  jobs: DownloadJob[];
  onClose: () => void;
  onOpenPlaylist: (playlistId: string) => void;
  onRetry?: (playlistId: string, videoIds: string[]) => void;
  onCancel?: (playlistId: string) => void;
}

function DownloadJobRow({
  job,
  onOpenPlaylist,
  onRetry,
  onCancel,
}: {
  job: DownloadJob;
  onOpenPlaylist: (id: string) => void;
  onRetry?: (playlistId: string, videoIds: string[]) => void;
  onCancel?: (playlistId: string) => void;
}) {
  const [showFailed, setShowFailed] = useState(false);
  const pct = job.toDownload > 0 ? Math.round((job.done / job.toDownload) * 100) : 0;
  const isActive = job.status === 'running' || job.status === 'starting';
  const hasFailed = (job.failedTracks?.length ?? 0) > 0;

  return (
    <div className="rounded-xl bg-background-secondary border border-border-subtle overflow-hidden">
      {/* Main row */}
      <div
        className="p-4 hover:bg-surface transition-colors cursor-pointer"
        onClick={() => onOpenPlaylist(job.playlistId)}
      >
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text truncate">{job.playlistTitle}</p>
            {isActive && job.currentTitle && (
              <p className="text-xs text-text-muted truncate mt-0.5">
                {job.currentTitle}
                {job.currentArtist && ` — ${job.currentArtist}`}
              </p>
            )}
            {job.status === 'done' && (
              <p className="text-xs text-accent mt-0.5">
                {job.done} track{job.done !== 1 ? 's' : ''} downloaded
                {job.errorCount > 0 && (
                  <span className="text-error ml-1">· {job.errorCount} failed</span>
                )}
              </p>
            )}
            {job.status === 'starting' && (
              <p className="text-xs text-text-disabled mt-0.5">Starting download…</p>
            )}
            {job.status === 'error' && (
              <p className="text-xs text-error mt-0.5">Download failed</p>
            )}
            {job.status === 'cancelled' && (
              <p className="text-xs text-text-disabled mt-0.5">Cancelled</p>
            )}
          </div>

          <div className="shrink-0 mt-0.5 flex items-center gap-1.5">
            {isActive && <Loader2 className="w-4 h-4 text-accent animate-spin" />}
            {job.status === 'done' && !hasFailed && <CheckCircle className="w-4 h-4 text-accent" />}
            {job.status === 'done' && hasFailed && <AlertCircle className="w-4 h-4 text-amber-400" />}
            {job.status === 'error' && <AlertCircle className="w-4 h-4 text-error" />}
            {isActive && onCancel && (
              <button
                title="Cancel download"
                onClick={(e) => { e.stopPropagation(); onCancel(job.playlistId); }}
                className="p-0.5 rounded text-text-disabled hover:text-error hover:bg-error/10 transition-colors"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {job.toDownload > 0 && (
          <div className="space-y-1">
            <div className="h-1.5 w-full bg-surface-hover rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  job.status === 'done' && !hasFailed
                    ? 'bg-accent'
                    : job.status === 'done' && hasFailed
                      ? 'bg-amber-400'
                      : job.status === 'error'
                        ? 'bg-error'
                        : 'bg-accent'
                }`}
                style={{ width: `${job.status === 'done' ? 100 : pct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-text-disabled font-medium">
              <span>{job.done} / {job.toDownload} tracks</span>
              <span>{job.status === 'done' ? '100' : pct}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Failed tracks section */}
      {hasFailed && (
        <div className="border-t border-border-subtle">
          <button
            onClick={() => setShowFailed((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2 text-[11px] text-text-muted hover:text-text hover:bg-surface transition-colors"
          >
            <span className="font-bold text-error">
              {job.failedTracks!.length} failed track{job.failedTracks!.length !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1">
              {showFailed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </span>
          </button>

          {showFailed && (
            <div className="px-4 pb-3 space-y-1.5 max-h-40 overflow-y-auto scrollbar-thin">
              {job.failedTracks!.map((ft) => (
                <div key={ft.videoId} className="flex flex-col gap-0.5">
                  <p className="text-xs font-medium text-text truncate">{ft.title}</p>
                  <p className="text-[10px] text-error truncate">{ft.error}</p>
                </div>
              ))}
            </div>
          )}

          {onRetry && (
            <div className="px-4 pb-3 pt-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry(job.playlistId, job.failedTracks!.map((ft) => ft.videoId));
                }}
                className="flex items-center gap-1.5 text-xs font-bold text-accent hover:text-accent/80 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry {job.failedTracks!.length} failed
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DownloadModal({ jobs, onClose, onOpenPlaylist, onRetry, onCancel }: Props) {
  const activeJobs = jobs.filter((j) => j.status === 'running' || j.status === 'starting');
  const finishedJobs = jobs.filter((j) => j.status === 'done' || j.status === 'error' || j.status === 'cancelled');

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-overlay/40 backdrop-blur-sm animate-context-menu-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
        <div className="w-full max-w-md bg-surface rounded-2xl border border-border shadow-2xl pointer-events-auto overflow-hidden animate-context-menu-in">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
            <div className="flex items-center gap-2.5">
              <Download className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-bold text-text tracking-tight">Downloads</h2>
              {activeJobs.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-accent/20 text-accent text-[10px] font-bold">
                  {activeJobs.length} active
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-disabled hover:text-text hover:bg-surface transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-4 py-4 max-h-[60vh] overflow-y-auto scrollbar-thin space-y-3">
            {jobs.length === 0 && (
              <div className="py-12 text-center">
                <Download className="w-8 h-8 text-text-disabled mx-auto mb-3" />
                <p className="text-sm text-text-disabled">No downloads yet.</p>
                <p className="text-xs text-text-disabled mt-1">
                  Right-click a playlist and choose "Download all songs"
                </p>
              </div>
            )}

            {activeJobs.length > 0 && (
              <div>
                <p className="text-[10px] text-text-disabled font-bold uppercase tracking-widest px-1 mb-2">
                  In Progress
                </p>
                <div className="space-y-2">
                  {activeJobs.map((job) => (
                    <DownloadJobRow
                      key={job.playlistId}
                      job={job}
                      onOpenPlaylist={onOpenPlaylist}
                      onRetry={onRetry}
                      onCancel={onCancel}
                    />
                  ))}
                </div>
              </div>
            )}

            {finishedJobs.length > 0 && (
              <div>
                <p className="text-[10px] text-text-disabled font-bold uppercase tracking-widest px-1 mb-2 mt-2">
                  Completed
                </p>
                <div className="space-y-2">
                  {finishedJobs.map((job) => (
                    <DownloadJobRow
                      key={job.playlistId}
                      job={job}
                      onOpenPlaylist={onOpenPlaylist}
                      onRetry={onRetry}
                      onCancel={onCancel}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-border-subtle bg-overlay/10">
            <p className="text-[10px] text-text-disabled text-center">
              Downloads continue in the background when this panel is closed
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

'use client';

import React from 'react';
import type { DownloadJob } from '@/types';
import {
  X,
  Download,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
} from 'lucide-react';

interface Props {
  jobs: DownloadJob[];
  onClose: () => void;
  onOpenPlaylist: (playlistId: string) => void;
}

function DownloadJobRow({ job, onOpenPlaylist }: { job: DownloadJob; onOpenPlaylist: (id: string) => void }) {
  const pct = job.toDownload > 0 ? Math.round((job.done / job.toDownload) * 100) : 0;

  return (
    <div
      className="p-4 rounded-xl bg-background-secondary hover:bg-surface transition-colors border border-border-subtle cursor-pointer"
      onClick={() => onOpenPlaylist(job.playlistId)}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text truncate">{job.playlistTitle}</p>
          {job.status === 'running' && job.currentTitle && (
            <p className="text-xs text-text-muted truncate mt-0.5">
              Downloading: {job.currentTitle}
              {job.currentArtist && ` â€” ${job.currentArtist}`}
            </p>
          )}
          {job.status === 'done' && (
            <p className="text-xs text-accent mt-0.5">
              {job.done} track{job.done !== 1 ? 's' : ''} downloaded
              {job.errorCount > 0 && `, ${job.errorCount} failed`}
            </p>
          )}
          {job.status === 'starting' && (
            <p className="text-xs text-text-disabled mt-0.5">Starting downloadâ€¦</p>
          )}
          {job.status === 'error' && (
            <p className="text-xs text-error mt-0.5">Download failed</p>
          )}
        </div>

        <div className="shrink-0 mt-0.5">
          {(job.status === 'running' || job.status === 'starting') && (
            <Loader2 className="w-4 h-4 text-accent animate-spin" />
          )}
          {job.status === 'done' && <CheckCircle className="w-4 h-4 text-accent" />}
          {job.status === 'error' && <AlertCircle className="w-4 h-4 text-error" />}
        </div>
      </div>

      {/* Progress bar */}
      {job.toDownload > 0 && (
        <div className="space-y-1">
          <div className="h-1.5 w-full bg-surface-hover rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${job.status === 'done' ? 'bg-accent' : job.status === 'error' ? 'bg-error' : 'bg-accent'
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
  );
}

export function DownloadModal({ jobs, onClose, onOpenPlaylist }: Props) {
  const activeJobs = jobs.filter((j) => j.status === 'running' || j.status === 'starting');
  const finishedJobs = jobs.filter((j) => j.status === 'done' || j.status === 'error');

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-overlay/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
        <div className="w-full max-w-md bg-surface rounded-2xl border border-border shadow-2xl pointer-events-auto overflow-hidden">
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
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-text-disabled hover:text-text hover:bg-surface transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="px-4 py-4 max-h-[60vh] overflow-y-auto scrollbar-thin space-y-3">
            {jobs.length === 0 && (
              <div className="py-12 text-center">
                <Download className="w-8 h-8 text-text-disabled mx-auto mb-3" />
                <p className="text-sm text-text-disabled">No downloads yet.</p>
                <p className="text-xs text-text-disabled mt-1">
                  Open a playlist and click "Download All"
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
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer note */}
          <div className="px-6 py-3 border-t border-border-subtle bg-overlay/10">
            <p className="text-[10px] text-text-disabled text-center">
              Downloads run in the background even when this panel is closed
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

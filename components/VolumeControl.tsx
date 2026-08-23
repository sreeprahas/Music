'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Volume, Volume1, Volume2, VolumeX } from 'lucide-react';

interface VolumeControlProps {
  volume: number; // 0.0 to 1.0
  isMuted: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  className?: string;
  iconClassName?: string;
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

export function VolumeControl({
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
  className = '',
  iconClassName = 'h-4 w-4',
}: VolumeControlProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const actualPercent = isMuted ? 0 : clampPercent(volume * 100);
  const isInteractive = hoverPercent !== null || isDragging;

  const percentFromPointer = useCallback(
    (clientX: number) => {
      const bounds = trackRef.current?.getBoundingClientRect();
      if (!bounds) return actualPercent;
      return clampPercent(((clientX - bounds.left) / Math.max(1, bounds.width)) * 100);
    },
    [actualPercent]
  );

  const applyPercent = useCallback(
    (percent: number) => {
      const nextVolume = clampPercent(percent) / 100;
      if (isMuted && nextVolume > 0) onToggleMute();
      onVolumeChange(nextVolume);
    },
    [isMuted, onToggleMute, onVolumeChange]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const percent = percentFromPointer(event.clientX);
      setHoverPercent(percent);
      if (isDragging) applyPercent(percent);
    },
    [applyPercent, isDragging, percentFromPointer]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* fallback */
      }
      setIsDragging(true);
      const percent = percentFromPointer(event.clientX);
      setHoverPercent(percent);
      applyPercent(percent);
    },
    [applyPercent, percentFromPointer]
  );

  const stopDragging = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);

    // Clear hover if pointer released outside track bounds
    const bounds = trackRef.current?.getBoundingClientRect();
    if (bounds) {
      const { clientX, clientY } = event;
      if (
        clientX < bounds.left ||
        clientX > bounds.right ||
        clientY < bounds.top ||
        clientY > bounds.bottom
      ) {
        setHoverPercent(null);
      }
    }
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const current = actualPercent;
      let next: number | null = null;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = current - 5;
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = current + 5;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = 100;
      if (next === null) return;
      event.preventDefault();
      applyPercent(next);
      setHoverPercent(clampPercent(next));
    },
    [actualPercent, applyPercent]
  );

  // Multi-stage Spotify volume icons
  const renderVolumeIcon = () => {
    if (isMuted || actualPercent === 0) return <VolumeX className={iconClassName} />;
    if (actualPercent < 33) return <Volume className={iconClassName} />;
    if (actualPercent < 66) return <Volume1 className={iconClassName} />;
    return <Volume2 className={iconClassName} />;
  };

  return (
    <div className={`flex items-center gap-2 select-none ${className}`}>
      {/* Spotify Mute Button */}
      <button
        type="button"
        onClick={onToggleMute}
        className="shrink-0 p-1 text-text-secondary hover:text-accent transition-colors duration-150 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        title={isMuted || volume === 0 ? 'Unmute' : 'Mute'}
        aria-label={isMuted || volume === 0 ? 'Unmute' : 'Mute'}
      >
        {renderVolumeIcon()}
      </button>

      {/* Spotify Slider Track */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(actualPercent)}
        className="relative flex h-3 min-w-[90px] w-32 cursor-pointer items-center outline-none"
        onPointerEnter={handlePointerMove}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onPointerLeave={() => {
          if (!isDragging) setHoverPercent(null);
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Track Base */}
        <div className="relative h-1 w-full rounded-full bg-surface-active overflow-hidden">
          {/* Layer 1: Gray Hover Line (follows cursor position) */}
          <div
            className={`pointer-events-none absolute inset-y-0 left-0 z-[1] rounded-full bg-accent/35 transition-opacity duration-150 ${
              hoverPercent !== null ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ width: `${hoverPercent ?? 0}%` }}
          />

          {/* Layer 2: Active Volume Fill (White default -> Spotify Green on hover/drag) */}
          <div
            className={`pointer-events-none absolute inset-y-0 left-0 z-[2] rounded-full transition-colors duration-150 ${
              'bg-accent'
            }`}
            style={{ width: `${actualPercent}%` }}
          />
        </div>

        {/* Layer 3: White Thumb Knob (Visible only on hover/drag) */}
        <span
            className={`pointer-events-none absolute top-1/2 z-[3] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text shadow-md transition-opacity duration-150 ${
            isInteractive ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ left: `${actualPercent}%` }}
        />
      </div>
    </div>
  );
}

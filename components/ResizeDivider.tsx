'use client';
import React, { useCallback } from 'react';

interface Props {
  onDelta: (delta: number) => void;
}

export function ResizeDivider({ onDelta }: Props) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      let lastX = e.clientX;

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - lastX;
        lastX = ev.clientX;
        onDelta(delta);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [onDelta]
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      className="w-px shrink-0 relative cursor-col-resize group z-10 bg-accent/35 hover:bg-accent/60 transition-colors duration-300"
    >
      {/* Fat invisible hit zone so it's easy to grab */}
      <div className="absolute inset-y-0 -left-1 -right-1" />
      {/* Visible line on hover */}
      <div className="absolute inset-0 group-hover:bg-accent group-hover:shadow-accent-strong transition-all duration-300 rounded-full" />
    </div>
  );
}

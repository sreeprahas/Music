import React from 'react';

export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-white/[0.09] ${className}`} style={style} />;
}

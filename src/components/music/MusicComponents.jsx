import React from 'react';
import { Icon } from '../Icons.jsx';

export const MusicEmbed = React.memo(React.forwardRef(function MusicEmbed({ src, title }, ref) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        borderRadius: 8,
      }}
    >
      <iframe
        ref={ref}
        src={src}
        title={title}
        tabIndex={-1}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 240,
          height: 135,
          transform: 'translate(-50%, -50%)',
          opacity: 0.02,
          pointerEvents: 'none',
          border: 'none',
        }}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      />
    </div>
  );
}));

export function MiniBtn({ title, onClick, children }) {
  return (
    <button onClick={onClick} title={title} style={{
      all: 'unset',
      cursor: 'pointer',
      width: 24,
      height: 24,
      borderRadius: 7,
      display: 'grid',
      placeItems: 'center',
      background: 'var(--surface)',
      color: 'var(--ink-soft)',
      border: '1px solid var(--hairline)',
    }}>
      {children}
    </button>
  );
}

export function PauseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

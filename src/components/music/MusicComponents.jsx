import React from 'react';

/**
 * The stream's real embed. It stays mounted in one place inside the device
 * screen so toggling between visualizer and video never reloads the stream:
 * hidden mode keeps it nearly transparent behind the visualizer, screen mode
 * shows it full-bleed on the LCD.
 */
export const MusicEmbed = React.memo(React.forwardRef(function MusicEmbed({ src, title, visible, onLoad }, ref) {
  return (
    <div
      aria-hidden={visible ? undefined : 'true'}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: visible ? 'auto' : 'none',
        zIndex: visible ? 2 : 0,
      }}
    >
      <iframe
        ref={ref}
        src={src}
        title={title}
        tabIndex={visible ? 0 : -1}
        onLoad={onLoad}
        style={visible ? {
          position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none',
        } : {
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

export function PauseIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

export function PlayIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function RewindIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11 6v12L2.5 12zM21 6v12l-8.5-6z" />
    </svg>
  );
}

export function ForwardIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 6v12l8.5-6zM3 6v12l8.5-6z" />
    </svg>
  );
}

export function EjectIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 4l8 10H4zM4 17h16v3H4z" />
    </svg>
  );
}

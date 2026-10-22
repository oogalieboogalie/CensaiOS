import React from 'react';
import { webOnlyFrameSrc } from '../../lib/frameSrc.js';

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
        src={webOnlyFrameSrc(src) || undefined}
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
        // Only YouTube, Spotify and SoundCloud players are framed here (musicHosts.js);
        // they need scripts and their own site's storage, and nothing more.
        sandbox="allow-scripts allow-same-origin allow-presentation"
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

export function PrevIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5 5h2.5v14H5zM20 5v14L9 12z" />
    </svg>
  );
}

export function NextIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.5 5H19v14h-2.5zM4 5v14l11-7z" />
    </svg>
  );
}

export function SpeakerIcon({ size = 13, muted = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" />
      {muted
        ? <path d="M17 9l5 6M22 9l-5 6" />
        : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
    </svg>
  );
}

export function NoteIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9 4v11.3A3.5 3.5 0 1 0 11 18V8h8V4z" />
    </svg>
  );
}

export function UsbIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v15M9 6l3-3 3 3M12 14l-5-3V8M12 12l5-3V7" />
      <circle cx="12" cy="19.5" r="1.8" fill="currentColor" />
    </svg>
  );
}

export function CloseIcon({ size = 9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

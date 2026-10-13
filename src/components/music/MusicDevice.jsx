import React from 'react';
import { skinVars } from './musicSkins.js';
import { ForwardIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, RewindIcon, SpeakerIcon } from './MusicComponents.jsx';

// Hardware pieces of the retro player. Colors come from the source's skin as
// CSS custom properties (skinVars); shapes and bevels live in
// src/styles/music.css.

/** Watches an element's height so the device can drop its wheel when short. */
export function useElementHeight(ref) {
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return height;
}

/** Plastic body of the player: bevel, brand wordmark, status LED, USB drop. */
export const DeviceShell = React.forwardRef(function DeviceShell(
  { skin, source, playing, onFiles, children, ...rest },
  ref,
) {
  const [dragging, setDragging] = React.useState(false);
  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
  const dropProps = onFiles ? {
    onDragOver: (e) => { if (!hasFiles(e)) return; e.preventDefault(); setDragging(true); },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); },
    onDrop: (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);
      onFiles(e.dataTransfer.files);
    },
  } : {};
  return (
    <div ref={ref} className="hb-music-device" data-music-device={source} style={skinVars(skin)} {...dropProps} {...rest}>
      <div className="hb-music-device-head">
        <span className="hb-music-screw" aria-hidden="true" />
        <span className="hb-music-brand">{skin.brand}</span>
        <span className="hb-music-model">{skin.model}</span>
        <span className="hb-music-spacer" />
        <span className="hb-music-led" data-on={playing ? 'true' : undefined} title={playing ? 'Playing' : 'Idle'} />
        <BatteryGlyph />
      </div>
      {children}
      {dragging && (
        <div className="hb-music-drop" aria-live="polite">
          <span>Drop audio files to copy them to USB</span>
          <span className="hb-music-drop-note">They stay on this computer and play only for you</span>
        </div>
      )}
    </div>
  );
});

function BatteryGlyph() {
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden="true" className="hb-music-battery">
      <rect x="0.5" y="0.5" width="16" height="9" rx="2" fill="none" stroke="currentColor" />
      <rect x="17" y="3" width="2.5" height="4" rx="1" fill="currentColor" />
      <rect x="2" y="2" width="9" height="6" rx="1" fill="currentColor" />
    </svg>
  );
}

/** Recessed LCD with scanlines and a glass glare. */
export function DeviceScreen({ children, className = '', style }) {
  return (
    <div className={`hb-music-screen ${className}`} style={style}>
      {children}
      <span aria-hidden="true" className="hb-music-scanlines" />
    </div>
  );
}

export function LcdLine({ size = 'sm', dim, className = '', children, style, ...rest }) {
  return (
    <div className={`hb-music-lcd hb-music-lcd-${size} ${className}`} data-dim={dim ? 'true' : undefined} style={style} {...rest}>
      {children}
    </div>
  );
}

/** Scrolling track title, like the dot-matrix ticker on old players. */
export function Marquee({ text }) {
  const long = (text || '').length > 24;
  return (
    <div className="hb-music-marquee hb-music-lcd hb-music-lcd-lg">
      <div
        className="hb-music-marquee-track"
        data-moving={long ? 'true' : undefined}
        title={text}
        style={long ? { animationDuration: `${Math.max(8, text.length * 0.35)}s` } : undefined}
      >
        <span>{text}</span>
        {long && <span aria-hidden="true">{text}</span>}
      </div>
    </div>
  );
}

export function ProgressBar({ position, duration, onSeek }) {
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  return (
    <div
      className="hb-music-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration || 0)}
      aria-valuenow={Math.round(position || 0)}
      data-seekable={duration && onSeek ? 'true' : undefined}
      onClick={(e) => {
        if (!duration || !onSeek) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek(((e.clientX - rect.left) / rect.width) * duration);
      }}
    >
      <div className="hb-music-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** On-screen volume readout that shows for a moment after a change. */
export function VolumeOverlay({ volume, muted, shownAt }) {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const left = 1200 - (Date.now() - (shownAt || 0));
    if (!shownAt || left <= 0) return undefined;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), left);
    return () => clearTimeout(t);
  }, [shownAt]);
  if (!visible) return null;
  const lit = muted ? 0 : Math.round(volume / 5);
  return (
    <div className="hb-music-volume" role="status" aria-label={muted ? 'Muted' : `Volume ${volume}`}>
      <SpeakerIcon muted={muted} size={14} />
      <div className="hb-music-volume-steps">
        {Array.from({ length: 20 }, (_, i) => <span key={i} data-on={i < lit ? 'true' : undefined} />)}
      </div>
      <LcdLine size="xs">{muted ? 'MUTE' : volume}</LcdLine>
    </div>
  );
}

/**
 * iPod-era click wheel: MENU, previous / next track, VIS around a play hub.
 * Scrolling over the wheel turns this viewer's volume, like spinning it.
 */
export function ClickWheel({ paused, disabled, canStep, onMenu, onPrev, onNext, onVis, onToggle, onVolume, size = 124 }) {
  const ref = React.useRef(null);
  const volumeRef = React.useRef(onVolume);
  volumeRef.current = onVolume;
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    // Non-passive so the canvas does not zoom while the wheel turns.
    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      volumeRef.current?.(e.deltaY < 0 ? 5 : -5);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const stepDisabled = disabled || !canStep;
  return (
    <div ref={ref} className="hb-music-wheel" style={{ width: size, height: size }} title="Scroll to change your volume">
      <button type="button" className="hb-music-wheel-key" data-pos="top" aria-label="Library" title="Library" onClick={onMenu}>MENU</button>
      <button type="button" className="hb-music-wheel-key" data-pos="left" aria-label="Previous track" title="Previous track" onClick={onPrev} disabled={stepDisabled}><PrevIcon /></button>
      <button type="button" className="hb-music-wheel-key" data-pos="right" aria-label="Next track" title="Next track" onClick={onNext} disabled={stepDisabled}><NextIcon /></button>
      <button type="button" className="hb-music-wheel-key" data-pos="bottom" aria-label="Change visualization" title="Change visualization" onClick={onVis}>VIS</button>
      <button
        type="button"
        className="hb-music-hub"
        style={{ width: Math.round(size * 0.38), height: Math.round(size * 0.38) }}
        aria-label={paused ? 'Play' : 'Pause'}
        title={disabled ? 'Use the embedded player controls for this source' : (paused ? 'Play' : 'Pause')}
        onClick={onToggle}
        disabled={disabled}
      >
        {paused ? <PlayIcon size={16} /> : <PauseIcon size={16} />}
      </button>
    </div>
  );
}

/** Small hardware-style pill button used along the device's bottom edge. */
export function DeviceKey({ title, active, onClick, children, disabled }) {
  return (
    <button
      type="button"
      className="hb-music-key"
      title={title}
      aria-label={title}
      aria-pressed={active === undefined ? undefined : Boolean(active)}
      data-active={active ? 'true' : undefined}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export { ForwardIcon, RewindIcon };

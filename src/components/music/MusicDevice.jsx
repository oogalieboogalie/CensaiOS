import React from 'react';
import { EjectIcon, ForwardIcon, PauseIcon, PlayIcon, RewindIcon } from './MusicComponents.jsx';

const MARQUEE_CSS = `
@keyframes hb-music-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes hb-music-blink { 0%, 60% { opacity: 1; } 61%, 100% { opacity: 0.25; } }
@media (prefers-reduced-motion: reduce) {
  [data-music-marquee] { animation: none !important; }
  [data-music-blink] { animation: none !important; }
}
`;

const lcdText = (skin, size = 10) => ({
  fontFamily: 'var(--font-label)',
  fontSize: size,
  letterSpacing: 'var(--label-tracking)',
  textTransform: 'var(--label-case)',
  color: skin.lcdInk,
  textShadow: `0 0 6px ${skin.lcdGlow}`,
});

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

/** Plastic body of the player: gloss, bevel, brand wordmark and status LED. */
export const DeviceShell = React.forwardRef(function DeviceShell({ skin, source, playing, children }, ref) {
  return (
    <div
      ref={ref}
      data-music-device={source}
      style={{
        flex: 1, minHeight: 0, margin: 8, position: 'relative',
        display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px 14px',
        borderRadius: 26, background: skin.body, color: skin.bodyInk,
        border: `1px solid ${skin.bodyEdge}`,
        boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.35), inset 0 -3px 0 rgba(0,0,0,0.28), 0 8px 18px rgba(0,0,0,0.28)',
        overflow: 'hidden auto',
      }}
    >
      <style>{MARQUEE_CSS}</style>
      <span aria-hidden="true" style={{
        position: 'absolute', inset: 0, borderRadius: 26, pointerEvents: 'none',
        background: 'linear-gradient(170deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0.06) 28%, rgba(255,255,255,0) 45%)',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
        <span aria-hidden="true" style={{
          width: 10, height: 10, borderRadius: 'var(--radius-full)', flexShrink: 0,
          background: 'rgba(0,0,0,0.35)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.3)',
        }} />
        <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 'var(--text-md)', letterSpacing: '-0.01em', fontStyle: 'italic' }}>
          {skin.brand}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', letterSpacing: '0.14em', opacity: 0.7 }}>{skin.model}</span>
        <span style={{ flex: 1 }} />
        <span
          data-music-blink={playing ? 'true' : undefined}
          title={playing ? 'Playing' : 'Idle'}
          style={{
            width: 7, height: 7, borderRadius: 'var(--radius-full)',
            background: playing ? '#46ff7a' : 'rgba(0,0,0,0.35)',
            boxShadow: playing ? '0 0 8px #46ff7a' : 'inset 0 1px 1px rgba(0,0,0,0.5)',
            animation: playing ? 'hb-music-blink 1.2s steps(1) infinite' : 'none',
          }}
        />
        <BatteryGlyph />
      </div>
      {children}
    </div>
  );
});

function BatteryGlyph() {
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden="true" style={{ opacity: 0.8 }}>
      <rect x="0.5" y="0.5" width="16" height="9" rx="2" fill="none" stroke="currentColor" />
      <rect x="17" y="3" width="2.5" height="4" rx="1" fill="currentColor" />
      <rect x="2" y="2" width="9" height="6" rx="1" fill="currentColor" />
    </svg>
  );
}

/** Recessed LCD with scanlines and a glass glare. */
export function DeviceScreen({ skin, children, style }) {
  return (
    <div style={{
      position: 'relative', borderRadius: 'var(--radius-xl)', padding: 8, overflow: 'hidden',
      background: skin.screenBg,
      border: '3px solid rgba(0,0,0,0.6)',
      boxShadow: 'inset 0 0 18px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.35)',
      display: 'flex', flexDirection: 'column', gap: 6,
      ...style,
    }}>
      {children}
      <span aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3,
        background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 3px)',
        mixBlendMode: 'multiply',
      }} />
      <span aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3,
        background: 'linear-gradient(155deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.03) 35%, transparent 36%)',
      }} />
    </div>
  );
}

export function LcdLine({ skin, size, children, style }) {
  return <div style={{ ...lcdText(skin, size), ...style }}>{children}</div>;
}

/** Scrolling track title, like the dot-matrix ticker on old players. */
export function Marquee({ skin, text }) {
  const long = (text || '').length > 24;
  const row = { display: 'inline-block', paddingRight: 40 };
  return (
    <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', ...lcdText(skin, 12), fontWeight: 700, letterSpacing: '0.04em', textTransform: 'none' }}>
      <div
        data-music-marquee={long ? 'true' : undefined}
        title={text}
        style={{ display: 'inline-block', animation: long ? `hb-music-marquee ${Math.max(8, text.length * 0.35)}s linear infinite` : 'none' }}
      >
        <span style={row}>{text}</span>
        {long && <span style={row} aria-hidden="true">{text}</span>}
      </div>
    </div>
  );
}

export function ProgressBar({ skin, position, duration, onSeek }) {
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration || 0)}
      aria-valuenow={Math.round(position || 0)}
      onClick={(e) => {
        if (!duration || !onSeek) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek(((e.clientX - rect.left) / rect.width) * duration - position);
      }}
      style={{
        position: 'relative', height: 6, borderRadius: 'var(--radius-xs)', cursor: duration ? 'pointer' : 'default',
        background: skin.lcdDim, opacity: 0.9, boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6)',
      }}
    >
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 'var(--radius-xs)',
        background: `linear-gradient(90deg, ${skin.vis[0]}, ${skin.vis[2]})`, boxShadow: `0 0 6px ${skin.lcdGlow}`,
      }} />
    </div>
  );
}

const wheelLabel = (skin) => ({
  all: 'unset', cursor: 'pointer', position: 'absolute', display: 'grid', placeItems: 'center',
  color: skin.wheelInk, fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 'var(--text-xs)', letterSpacing: '0.12em',
  width: 34, height: 26,
});

/** iPod-era click wheel: MENU / rewind / forward / VIS around a play hub. */
export function ClickWheel({ skin, paused, disabled, onMenu, onBack, onForward, onVis, onToggle, size = 124 }) {
  const hub = Math.round(size * 0.38);
  return (
    <div style={{
      position: 'relative', width: size, height: size, borderRadius: '50%', flexShrink: 0, alignSelf: 'center',
      background: skin.wheel,
      boxShadow: 'inset 0 2px 1px rgba(255,255,255,0.7), inset 0 -3px 6px rgba(0,0,0,0.25), 0 3px 8px rgba(0,0,0,0.3)',
    }}>
      <button type="button" aria-label="Library" title="Library" onClick={onMenu}
        style={{ ...wheelLabel(skin), left: '50%', top: 6, transform: 'translateX(-50%)' }}>MENU</button>
      <button type="button" aria-label="Back 10 seconds" title="Back 10s" onClick={onBack} disabled={disabled}
        style={{ ...wheelLabel(skin), left: 4, top: '50%', transform: 'translateY(-50%)', opacity: disabled ? 0.4 : 1 }}><RewindIcon /></button>
      <button type="button" aria-label="Forward 10 seconds" title="Forward 10s" onClick={onForward} disabled={disabled}
        style={{ ...wheelLabel(skin), right: 4, top: '50%', transform: 'translateY(-50%)', opacity: disabled ? 0.4 : 1 }}><ForwardIcon /></button>
      <button type="button" aria-label="Change visualization" title="Change visualization" onClick={onVis}
        style={{ ...wheelLabel(skin), left: '50%', bottom: 6, transform: 'translateX(-50%)' }}>VIS</button>
      <button
        type="button"
        aria-label={paused ? 'Play' : 'Pause'}
        title={disabled ? 'Use the embedded player controls for this source' : (paused ? 'Play' : 'Pause')}
        onClick={onToggle}
        disabled={disabled}
        style={{
          all: 'unset', cursor: disabled ? 'not-allowed' : 'pointer', position: 'absolute',
          left: '50%', top: '50%', width: hub, height: hub, transform: 'translate(-50%, -50%)',
          borderRadius: '50%', display: 'grid', placeItems: 'center',
          background: skin.hub, color: skin.hubInk, opacity: disabled ? 0.5 : 1,
          boxShadow: 'inset 0 2px 1px rgba(255,255,255,0.45), inset 0 -2px 4px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.35)',
        }}
      >
        {paused ? <PlayIcon size={16} /> : <PauseIcon size={16} />}
      </button>
    </div>
  );
}

/** Small hardware-style pill button used along the device's bottom edge. */
export function DeviceKey({ skin, title, active, onClick, children, disabled }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active === undefined ? undefined : Boolean(active)}
      onClick={onClick}
      disabled={disabled}
      style={{
        all: 'unset', cursor: disabled ? 'not-allowed' : 'pointer', minWidth: 26, height: 22, padding: '0 8px',
        borderRadius: 'var(--radius-xl)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.1em',
        color: active ? skin.hubInk : skin.bodyInk,
        background: active ? skin.hub : 'rgba(0,0,0,0.22)',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.25)',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}

export { EjectIcon, ForwardIcon, PauseIcon, PlayIcon, RewindIcon };

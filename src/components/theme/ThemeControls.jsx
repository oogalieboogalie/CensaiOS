import React from 'react';
import { Icon } from '../Icons.jsx';
import { MOODS, clamp, oklch, parseOklch } from '../Theme.jsx';

export function ColorWheel({ hue, chroma, onChange, size = 184, maxChroma = 0.22 }) {
  const radius = size / 2 - 9;
  const ref = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);

  const setFromXY = (clientX, clientY) => {
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    const dist = Math.min(radius, Math.hypot(dx, dy));
    onChange({ hue: Math.round(angle), chroma: +(dist / radius * maxChroma).toFixed(3) });
  };

  const t = hue * Math.PI / 180;
  const dotRadius = clamp(chroma / maxChroma, 0, 1) * radius;
  const dotX = size / 2 + Math.cos(t) * dotRadius;
  const dotY = size / 2 + Math.sin(t) * dotRadius;

  return (
    <div
      ref={ref}
      onPointerDown={(e) => { setDragging(true); ref.current.setPointerCapture(e.pointerId); setFromXY(e.clientX, e.clientY); }}
      onPointerMove={(e) => { if (dragging) setFromXY(e.clientX, e.clientY); }}
      onPointerUp={(e) => { setDragging(false); try { ref.current.releasePointerCapture(e.pointerId); } catch {} }}
      onPointerCancel={(e) => { setDragging(false); try { ref.current.releasePointerCapture(e.pointerId); } catch {} }}
      style={{
        width: size,
        height: size,
        position: 'relative',
        borderRadius: '50%',
        cursor: 'crosshair',
        touchAction: 'none',
        background: 'conic-gradient(from 90deg, oklch(0.66 0.24 0), oklch(0.66 0.24 60), oklch(0.66 0.24 120), oklch(0.66 0.24 180), oklch(0.66 0.24 240), oklch(0.66 0.24 300), oklch(0.66 0.24 360))',
        boxShadow: 'inset 0 0 0 1px var(--hairline), 0 18px 30px -22px oklch(0 0 0 / 0.45)',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle at center, var(--surface) 0%, oklch(1 0 0 / 0.2) 28%, transparent 72%)' }} />
      <div style={{ position: 'absolute', left: dotX, top: dotY, transform: 'translate(-50%,-50%)', width: 16, height: 16, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 0 2px var(--surface), 0 0 0 3px oklch(0 0 0 / 0.36), 0 5px 12px oklch(0 0 0 / 0.25)', pointerEvents: 'none' }} />
    </div>
  );
}

export function Slider({ label, value, min, max, step, onChange, format = v => v }) {
  return (
    <label style={{ display: 'grid', gap: 7 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        <span>{label}</span>
        <span>{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} style={{ width: '100%', accentColor: 'var(--accent)' }} />
    </label>
  );
}

export function ThemePanelCard({ children, style }) {
  return (
    <div style={{ border: '1px solid var(--hairline)', borderRadius: 8, background: 'var(--surface-2)', ...style }}>
      {children}
    </div>
  );
}

export function SurfaceControl({ item, theme, setTheme, activeSurface, setActiveSurface }) {
  const moodVars = (MOODS[theme.mood] || MOODS.cream).vars;
  const customVars = theme.customVars || {};
  const value = customVars[item.varName] || moodVars[item.varName];
  const color = parseOklch(value);
  const customized = Boolean(customVars[item.varName]);
  const update = (patch) => setTheme({ customVars: { ...customVars, [item.varName]: oklch({ ...color, ...patch }) } });
  const reset = () => {
    const next = { ...customVars };
    delete next[item.varName];
    setTheme({ customVars: next });
  };

  const isActive = activeSurface === item.previewKey;

  return (
    <div
      onMouseEnter={() => setActiveSurface?.(item.previewKey)}
      onFocus={() => setActiveSurface?.(item.previewKey)}
      onClick={() => setActiveSurface?.(item.previewKey)}
      style={{
        display: 'grid',
        gap: isActive ? 10 : 0,
        padding: isActive ? '12px' : '8px 12px',
        borderTop: '1px solid var(--hairline)',
        background: isActive ? 'var(--accent-soft)' : 'transparent',
        transition: 'background 0.15s, padding 0.15s, gap 0.15s',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: value, boxShadow: 'inset 0 0 0 1px oklch(0 0 0 / 0.14)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: isActive ? 750 : 600, color: 'var(--ink)' }}>{item.label}</div>
          {isActive && (
            <div style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 2, lineHeight: 1.35 }}>{item.hint}</div>
          )}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', marginTop: 2 }}>{value}</div>
        </div>
        {customized && (
          <button onClick={(e) => { e.stopPropagation(); reset(); }} title={`Reset ${item.label}`} style={{ all: 'unset', cursor: 'pointer', display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: 6, color: 'var(--ink-faint)', background: 'var(--surface)', flexShrink: 0 }}>
            <Icon.Close size={11} />
          </button>
        )}
      </div>
      {isActive && (
        <div style={{ display: 'grid', gap: 10, marginTop: 4, padding: '4px 0 0 0' }}>
          <Slider label="Hue" value={Math.round(color.h)} min={0} max={360} step={1} onChange={(h) => update({ h })} format={v => `${v}°`} />
          <Slider label="Depth" value={+color.c.toFixed(3)} min={0} max={0.24} step={0.005} onChange={(c) => update({ c })} format={v => v.toFixed(3)} />
          <Slider label="Light" value={+color.l.toFixed(3)} min={0.08} max={0.99} step={0.005} onChange={(l) => update({ l })} format={v => v.toFixed(3)} />
        </div>
      )}
    </div>
  );
}

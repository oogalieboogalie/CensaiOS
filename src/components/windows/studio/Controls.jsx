/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { useTick } from './ticker.js';

// Studio controls: a knob that drags up and down (Shift for fine, double
// click to reset, wheel to nudge), a vertical fader and a peak meter.

const toNorm = (v, { min, max, curve }) => (curve === 'log' && min > 0 ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min));
const fromNorm = (t, { min, max, curve }) => (curve === 'log' && min > 0 ? min * Math.pow(max / min, t) : min + t * (max - min));

export function formatValue(v, unit) {
  if (unit === 'Hz') return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)} kHz` : `${Math.round(v)} Hz`;
  if (unit === 'ms') return v >= 100 ? `${Math.round(v)} ms` : `${v.toFixed(1)} ms`;
  if (unit === 'dB') return `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
  if (unit === '%') return `${Math.round(v)}%`;
  if (unit === ':1') return `${v.toFixed(1)}:1`;
  if (unit === 'x') return `${v.toFixed(2)}x`;
  if (unit === 's') return v < 0.1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`;
  return `${Math.round(v * 100) / 100}${unit || ''}`;
}

function useDragValue(spec, value, onChange, axis = 'y', pixels = 160) {
  return (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const startPos = axis === 'y' ? e.clientY : e.clientX;
    const startNorm = toNorm(value, spec);
    const move = (ev) => {
      const delta = (axis === 'y' ? startPos - ev.clientY : ev.clientX - startPos) / (ev.shiftKey ? pixels * 6 : pixels);
      const t = Math.min(1, Math.max(0, startNorm + delta));
      onChange(fromNorm(t, spec), false);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); onChange(null, true); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
}

export function Knob({ spec, value, onChange, size = 36 }) {
  const t = Math.min(1, Math.max(0, toNorm(value, spec)));
  const a0 = -135; const a = a0 + 270 * t;
  const r = size / 2 - 3; const c = size / 2;
  const pt = deg => [c + r * Math.sin((deg * Math.PI) / 180), c - r * Math.cos((deg * Math.PI) / 180)];
  const arc = (from, to) => { const [x0, y0] = pt(from); const [x1, y1] = pt(to); return `M${x0} ${y0} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
  const onDown = useDragValue(spec, value, (v) => { if (v !== null) onChange(v); });
  const onWheel = (e) => { e.stopPropagation(); onChange(fromNorm(Math.min(1, Math.max(0, t + (e.deltaY < 0 ? 0.02 : -0.02))), spec)); };
  return (
    <div className="hb-studio-knob" data-no-drag title={`${spec.label}: ${formatValue(value, spec.unit)}. Drag, Shift for fine, double-click resets.`}>
      <svg width={size} height={size} role="slider" aria-label={spec.label} aria-valuenow={value} aria-valuemin={spec.min} aria-valuemax={spec.max}
        tabIndex={0} onPointerDown={onDown} onWheel={onWheel} onDoubleClick={() => onChange(spec.def)}
        onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); onChange(fromNorm(Math.min(1, Math.max(0, t + (e.key === 'ArrowUp' ? 0.01 : -0.01))), spec)); } }}>
        <path d={arc(a0, 135)} className="hb-studio-knob-track" />
        {t > 0.002 && <path d={arc(a0, a)} className="hb-studio-knob-value" />}
        <line x1={c} y1={c} x2={pt(a)[0]} y2={pt(a)[1]} className="hb-studio-knob-pointer" />
      </svg>
      <span className="hb-studio-knob-label">{spec.label}</span>
      <span className="hb-studio-knob-readout">{formatValue(value, spec.unit)}</span>
    </div>
  );
}

const FADER = { min: -60, max: 6, curve: 'lin' };
// Faders feel right with more travel near 0 dB: map position through a square root.
const faderNorm = db => Math.sqrt((db - FADER.min) / (FADER.max - FADER.min));
const faderDb = t => FADER.min + t * t * (FADER.max - FADER.min);

export function Fader({ value, onChange, label }) {
  const ref = React.useRef(null);
  const onDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const rect = ref.current.getBoundingClientRect();
    const startY = e.clientY; const start = faderNorm(value);
    const move = ev => onChange(Math.round(faderDb(Math.min(1, Math.max(0, start + (startY - ev.clientY) / (rect.height * (ev.shiftKey ? 5 : 1))))) * 10) / 10);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  return (
    <div ref={ref} className="hb-studio-fader" data-no-drag role="slider" aria-label={label} aria-valuenow={value} tabIndex={0}
      onPointerDown={onDown} onDoubleClick={() => onChange(0)} title={`${label}: ${value <= -60 ? '-inf' : formatValue(value, 'dB')}. Double-click for 0 dB.`}>
      <div className="hb-studio-fader-zero" style={{ bottom: `${faderNorm(0) * 100}%` }} />
      <div className="hb-studio-fader-cap" style={{ bottom: `calc(${faderNorm(value) * 100}% - 5px)` }} />
    </div>
  );
}

const meterPos = (peak) => {
  const d = peak > 1e-5 ? 20 * Math.log10(peak) : -100;
  return Math.max(0, Math.min(1, (d + 60) / 66));
};

/** Stereo or mono peak meter fed by the ticker. `pick` selects the level(s) from the meters. */
export function Meter({ ticker, pick, vertical = true }) {
  const levels = useTick(ticker, s => pick(s.meters));
  const list = Array.isArray(levels) ? levels : [levels || 0];
  return (
    <div className="hb-studio-meter" data-vertical={vertical ? 'true' : undefined} aria-hidden="true">
      {list.map((p, i) => (
        <div key={i} className="hb-studio-meter-bar" data-hot={p >= 0.99 ? 'true' : undefined}>
          <div className="hb-studio-meter-fill" style={vertical ? { height: `${meterPos(p) * 100}%` } : { width: `${meterPos(p) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

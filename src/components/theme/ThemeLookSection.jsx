import React from 'react';
import { ThemePanelCard, Slider } from './ThemeControls.jsx';
import { GROUP_GAP_RANGE } from '../../lib/layout/gap.js';
import { MOODS } from '../Theme.jsx';
import {
  CUSTOM_LOOK_ID,
  DEFAULT_CUSTOM_COLORS,
  DENSITIES,
  FONT_PAIRS,
  GLASS_RANGE,
  LABEL_STYLES,
  LOOKS,
  RADIUS_RANGE,
  matchLook,
  normalizeShape,
} from '../../lib/theme/looks.js';
import { HEADER_MODES, HEADER_MODE_LABELS } from '../../lib/windowHeader.js';

const HEADER_OPTIONS = Object.fromEntries(HEADER_MODES.map((id) => [id, { label: HEADER_MODE_LABELS[id] }]));

const sectionTitle = { fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--ink)' };
const sectionHint = { fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' };
const ghostButton = {
  all: 'unset', cursor: 'pointer', padding: '6px 10px', borderRadius: 'var(--radius-md)',
  background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-soft)',
  fontSize: 'var(--text-xs)', fontWeight: 600,
};

// A tiny board drawn in the look's own colors and corner radius, so every
// card previews the result before it is clicked.
function MiniBoard({ mood, radiusScale }) {
  const v = mood?.vars || {};
  const accent = mood?.accent ? `oklch(${mood.accent.lightness} ${mood.accent.chroma} ${mood.accent.hue})` : 'var(--accent)';
  const r = (px) => `${Math.round(px * radiusScale * 10) / 10}px`;
  const win = (style) => ({
    position: 'absolute', background: v['--surface'], border: `1px solid ${v['--hairline']}`, borderRadius: r(5), overflow: 'hidden', ...style,
  });
  const bar = (w, color) => ({ height: 3, width: w, borderRadius: r(2), background: color, marginBottom: 3 });
  return (
    <div aria-hidden="true" style={{ position: 'relative', height: 64, borderRadius: r(6), background: v['--canvas'] || v['--bg'], border: `1px solid ${v['--hairline']}`, overflow: 'hidden' }}>
      <div style={win({ left: 8, top: 8, width: '52%', height: 44, padding: 6 })}>
        <div style={bar('40%', v['--ink'])} />
        <div style={bar('80%', v['--ink-faint'])} />
        <div style={bar('65%', v['--ink-faint'])} />
        <div style={{ ...bar('30%', accent), height: 8, marginTop: 5, borderRadius: r(3) }} />
      </div>
      <div style={win({ right: 8, top: 16, width: '32%', height: 38, padding: 6, background: v['--surface-2'] })}>
        <div style={bar('70%', v['--ink-soft'])} />
        <div style={bar('50%', v['--ink-faint'])} />
      </div>
    </div>
  );
}

function LookCard({ id, label, blurb, mood, radiusScale, active, onClick }) {
  return (
    <button
      type="button"
      data-testid={`look-${id}`}
      aria-pressed={active}
      onClick={onClick}
      style={{
        all: 'unset', cursor: 'pointer', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, padding: 6, borderRadius: 'var(--radius-lg)',
        boxSizing: 'border-box', minWidth: 0, width: '100%', overflow: 'hidden',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--hairline)'}`,
        boxShadow: active ? '0 0 0 1px var(--accent)' : 'none', background: 'var(--surface)',
      }}
    >
      <MiniBoard mood={mood} radiusScale={radiusScale} />
      <div style={{ padding: '0 2px 2px', minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ink)' }}>{label}</div>
        <div style={{ ...sectionHint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{blurb}</div>
      </div>
    </button>
  );
}

function Segmented({ label, value, options, onChange }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <span style={sectionHint}>{label}</span>
      <div role="radiogroup" aria-label={label} style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 'var(--radius-md)', background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
        {Object.entries(options).map(([id, opt]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            onClick={() => onChange(id)}
            style={{
              all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '5px 6px', borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-xs)', fontWeight: 600,
              color: value === id ? 'var(--ink)' : 'var(--ink-faint)',
              background: value === id ? 'var(--surface)' : 'transparent',
              boxShadow: value === id ? 'var(--elevation-1)' : 'none',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CustomPanel({ theme, shape, setShape, setCustomColors }) {
  const colors = { ...DEFAULT_CUSTOM_COLORS, ...(theme.customColors || {}) };
  return (
    <div data-testid="look-custom-panel" style={{ display: 'grid', gap: 12, paddingTop: 4 }}>
      <Segmented label="Mode" value={colors.mode} options={{ dark: { label: 'Dark' }, light: { label: 'Light' } }} onChange={(mode) => setCustomColors({ mode })} />
      <Slider label="Base hue" value={colors.baseHue} min={0} max={360} step={1} onChange={(baseHue) => setCustomColors({ baseHue })} format={(v) => `${Math.round(v)}°`} />
      <Slider label="Tint" value={colors.tint} min={0} max={0.04} step={0.002} onChange={(tint) => setCustomColors({ tint })} format={(v) => `${Math.round(v * 2500)}%`} />
      <Slider label="Accent hue" value={colors.accentHue} min={0} max={360} step={1} onChange={(accentHue) => setCustomColors({ accentHue })} format={(v) => `${Math.round(v)}°`} />
      <Slider label="Corner radius" value={shape.radiusScale} min={RADIUS_RANGE.min} max={RADIUS_RANGE.max} step={RADIUS_RANGE.step} onChange={(radiusScale) => setShape({ radiusScale })} format={(v) => `${Math.round(v * 8)}px`} />
      <Slider label="Glass" value={shape.glass} min={GLASS_RANGE.min} max={GLASS_RANGE.max} step={GLASS_RANGE.step} onChange={(glass) => setShape({ glass })} format={(v) => `${Math.round(v * 100)}%`} />
      <Segmented label="Density" value={shape.density} options={DENSITIES} onChange={(density) => setShape({ density })} />
      <Segmented label="Font" value={shape.fontPair} options={FONT_PAIRS} onChange={(fontPair) => setShape({ fontPair })} />
      <Segmented label="Labels" value={shape.labelStyle} options={LABEL_STYLES} onChange={(labelStyle) => setShape({ labelStyle })} />
    </div>
  );
}

export function LookSection({ theme, applyLook, setShape, setCustomColors, exportTheme, importTheme }) {
  const activeLook = matchLook(theme);
  const shape = normalizeShape(theme);
  const [customOpen, setCustomOpen] = React.useState(activeLook === CUSTOM_LOOK_ID);
  const [importMessage, setImportMessage] = React.useState('');
  const fileRef = React.useRef(null);

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !importTheme) return;
    const result = await importTheme(file);
    setImportMessage(result.ok ? `Loaded “${result.name}”.` : result.error);
  };

  return (
    <ThemePanelCard style={{ padding: 12 }} data-testid="theme-look-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={sectionTitle}>Look</div>
          <div style={sectionHint}>Color, corners, density and type, together</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" style={ghostButton} onClick={() => fileRef.current?.click()}>Import</button>
          <button type="button" style={ghostButton} onClick={() => exportTheme?.()}>Export</button>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={onImport} style={{ display: 'none' }} data-testid="theme-import-input" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
        {Object.entries(LOOKS).map(([id, entry]) => (
          <LookCard
            key={id}
            id={id}
            label={entry.label}
            blurb={entry.blurb}
            mood={MOODS[entry.mood]}
            radiusScale={entry.shape.radiusScale}
            active={activeLook === id}
            onClick={() => { applyLook(id); setCustomOpen(false); }}
          />
        ))}
      </div>
      <div data-testid="look-header-mode" style={{ marginTop: 10 }}>
        <Segmented label="Window headers" value={shape.headerMode} options={HEADER_OPTIONS} onChange={(headerMode) => setShape({ headerMode })} />
        <div style={{ ...sectionHint, marginTop: 4 }}>Strip is always shown, Ghost appears on hover, Bare shows only a control pill.</div>
      </div>
      <div data-testid="look-group-gap" style={{ marginTop: 10 }}>
        <Slider label="Group gap" value={shape.groupGap} min={GROUP_GAP_RANGE.min} max={GROUP_GAP_RANGE.max} step={GROUP_GAP_RANGE.step} onChange={(groupGap) => setShape({ groupGap })} format={(v) => `${Math.round(v)}px`} />
        <div style={{ ...sectionHint, marginTop: 4 }}>Space between windows in a group. Groups re-tile when it changes.</div>
      </div>
      <button
        type="button"
        data-testid="look-custom"
        aria-expanded={customOpen}
        onClick={() => setCustomOpen((v) => !v)}
        style={{ ...ghostButton, display: 'block', textAlign: 'center', marginTop: 8, width: '100%', boxSizing: 'border-box', borderColor: activeLook === CUSTOM_LOOK_ID ? 'var(--accent)' : 'var(--hairline)' }}
      >
        {customOpen ? 'Hide custom controls' : 'Make your own'}
      </button>
      {customOpen && <CustomPanel theme={theme} shape={shape} setShape={setShape} setCustomColors={setCustomColors} />}
      {importMessage && <div role="status" style={{ ...sectionHint, marginTop: 8 }}>{importMessage}</div>}
    </ThemePanelCard>
  );
}

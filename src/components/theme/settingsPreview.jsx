import React from 'react';
import { oklch } from '../Theme.jsx';

/*
 * The one picture every Settings choice shows: a patch of board with a single
 * window on it, drawn the way the choice would draw it. Looks, colors, header
 * styles, border thickness and the group gap all use it, so every preview in
 * Settings reads the same way. Styles: .hb-pv in src/styles/settings.css.
 */

/** The --pv-* colors for a mood (a look's own palette); empty = the live theme. */
export function moodColors(mood) {
  if (!mood?.vars) return {};
  const v = mood.vars;
  const a = mood.accent;
  return {
    '--pv-canvas': v['--canvas'] || v['--bg'],
    '--pv-surface': v['--surface'],
    '--pv-line': v['--hairline'],
    '--pv-ink': v['--ink'],
    '--pv-ink-soft': v['--ink-soft'],
    '--pv-ink-faint': v['--ink-faint'],
    '--pv-accent': a ? oklch({ l: a.lightness, c: a.chroma, h: a.hue }) : undefined,
  };
}

function Bar() {
  return (
    <span className="hb-pv-bar">
      <span className="hb-pv-title" />
      <span className="hb-pv-dot" /><span className="hb-pv-dot" /><span className="hb-pv-dot" />
    </span>
  );
}

function Body() {
  return (
    <span className="hb-pv-body">
      <span className="hb-pv-line hb-pv-line--ink" />
      <span className="hb-pv-line hb-pv-line--a" />
      <span className="hb-pv-line hb-pv-line--b" />
      <span className="hb-pv-btn" />
    </span>
  );
}

/** One window: `header` is strip, ghost, bare or edge, as the window header setting draws it. */
function MiniWindow({ header = 'strip', style }) {
  return (
    <span className="hb-pv-win" style={style}>
      {header === 'strip' || header === 'ghost' ? <Bar /> : null}
      <Body />
      {header === 'bare' ? <span className="hb-pv-pill"><span className="hb-pv-dot" /><span className="hb-pv-dot" /><span className="hb-pv-dot" /></span> : null}
      {header === 'edge' ? <span className="hb-pv-edge"><span /><span /><span /></span> : null}
    </span>
  );
}

export function WindowPreview({ colors, radiusScale, header = 'strip', borderWidth, tall = false }) {
  const style = { ...colors };
  if (radiusScale != null) style['--pv-radius'] = `${Math.round(radiusScale * 4 * 10) / 10}px`;
  if (borderWidth) style['--pv-border'] = `${borderWidth}px`;
  return (
    <span aria-hidden="true" className={`hb-pv hb-pv--${header}${tall ? ' hb-pv--tall' : ''}`} style={style} data-testid="settings-preview">
      <MiniWindow header={header} />
    </span>
  );
}

/** A group of two windows with the chosen gap between them, inside the group's edge. */
export function GroupPreview({ gap, tall = true }) {
  return (
    <span aria-hidden="true" className={`hb-pv${tall ? ' hb-pv--tall' : ''}`} data-testid="settings-preview">
      <span className="hb-pv-group" style={{ gap: `${gap}px` }}>
        <MiniWindow />
        <MiniWindow />
      </span>
    </span>
  );
}

/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

// The Grid mark (docs/brand/): a C drawn from seven dots of the canvas dot
// grid, with one Signal dot inside it. Large keeps the 64-grid proportions;
// small (under 32 px) uses the bigger dots so the C stays a C.
const LARGE = { r: 7, at: [12, 32, 52] };
const SMALL = { r: 9, at: [10, 32, 54] };

export function BrandMark({ size = 32, title = 'censaiOS', style }) {
  const { r, at: [a, b, c] } = size < 32 ? SMALL : LARGE;
  const dots = [[a, a], [b, a], [c, a], [a, b], [a, c], [b, c], [c, c]];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : true} style={{ display: 'block', flexShrink: 0, ...style }}>
      {dots.map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="var(--brand-ink)" />)}
      <circle cx={b} cy={b} r={r} fill="var(--brand-ultem)" />
    </svg>
  );
}

// "censaiOS" set in Inter Semibold, tracked -2.2%, as in docs/brand/.
export function BrandWordmark({ size = 'var(--text-xl)', style }) {
  return (
    <span style={{
      fontFamily: '"Inter", var(--font-sans)', fontWeight: 600, fontSize: size,
      letterSpacing: '-0.022em', lineHeight: 1, color: 'var(--brand-ink)', ...style,
    }}>censaiOS</span>
  );
}

export function BrandLockup({ markSize = 28, textSize = 'var(--text-xl)', gap = 10, style }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap, ...style }}>
      <BrandMark size={markSize} title="" />
      <BrandWordmark size={textSize} />
    </span>
  );
}

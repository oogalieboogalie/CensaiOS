/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { brandFor } from '../../lib/brands/index.js';

// Brand colours this dark or this light vanish on one of the two looks, so
// the colour tone falls back to the current ink for them (GitHub, Vercel...).
function readableHex(hex) {
  if (!/^[0-9a-f]{6}$/i.test(hex || '')) return null;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.2 || lum > 0.9 ? null : `#${hex}`;
}

/**
 * A third-party service's mark (src/lib/brands). `tone="mono"` (default)
 * draws it in the current text colour, the monochrome version every brand
 * allows; `tone="color"` uses the brand's own colour. Unknown keys render
 * nothing, so callers can fall back to a board icon.
 */
export function BrandIcon({ brand, size = 14, tone = 'mono', title, className, style }) {
  const b = typeof brand === 'string' ? brandFor(brand) : brand;
  if (!b) return null;
  const label = title === undefined ? b.title : title;
  const fill = tone === 'color' ? (readableHex(b.hex) || 'currentColor') : 'currentColor';
  const common = {
    width: size, height: size, role: label ? 'img' : undefined, 'aria-hidden': label ? undefined : true,
    className: ['hb-brand-icon', className].filter(Boolean).join(' '), style, 'data-brand': b.key,
  };
  if (b.path) {
    // One unit of clear space on every side of the 24-unit mark.
    return (
      <svg viewBox="-1 -1 26 26" {...common}>
        {label && <title>{label}</title>}
        <path d={b.path} fill={fill} />
      </svg>
    );
  }
  const letters = String(b.monogram || b.title || '?').slice(0, 2);
  return (
    <svg viewBox="0 0 24 24" {...common} data-brand-monogram="true">
      {label && <title>{label}</title>}
      <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="none" stroke={fill} strokeWidth="1.6" />
      <text x="12" y="12.5" textAnchor="middle" dominantBaseline="middle" fill={fill}
        fontSize={letters.length > 1 ? 10 : 13} fontWeight="600" fontFamily="inherit" letterSpacing="-0.3">{letters}</text>
    </svg>
  );
}

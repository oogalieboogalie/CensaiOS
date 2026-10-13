/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { GAME_COVERS } from '../games/GameCover.jsx';
import { brandFor, BRAND_BY_KIND } from '../../lib/brands/index.js';
import { AGENT_COVERS } from './coversAgents.jsx';
import { SUITE_COVERS } from './coversSuite.jsx';
import { WORK_COVERS } from './coversWork.jsx';
import { BUILD_COVERS } from './coversBuild.jsx';
import { MEDIA_COVERS } from './coversMedia.jsx';

// Cover pictures for every row of the Add palette, in the style the Games
// set started (spec 11): small vector scenes in the board's own ink with one
// Ultem accent detail, so they suit light and dark alike.
const COVERS = { ...AGENT_COVERS, ...SUITE_COVERS, ...WORK_COVERS, ...BUILD_COVERS, ...MEDIA_COVERS, ...GAME_COVERS };

// A third-party window's own mark, whole and in the current ink, in the
// cover's right third (src/lib/brands logo rules: never redrawn or recoloured).
function BrandMark({ brand }) {
  if (!brand) return null;
  if (brand.path) {
    return <g transform="translate(31.5 6.5) scale(0.4583)"><path d={brand.path} fill="var(--ink)" /></g>;
  }
  return (
    <g>
      <rect x="31" y="6.5" width="11" height="11" rx="2" fill="none" stroke="var(--ink-faint)" />
      <text x="36.5" y="13.7" textAnchor="middle" fontSize="5" fontWeight="600" fill="var(--ink)">{brand.monogram}</text>
    </g>
  );
}

export function hasModuleCover(kind) {
  return Boolean(COVERS[kind]);
}

/**
 * A 44 x 24 cover card for a window kind. `brand` (a brand key) overrides the
 * kind's own brand, e.g. a search engine row. Unknown kinds render nothing so
 * the row falls back to its icon.
 */
export function ModuleCover({ kind, brand, width = 44, height = 24 }) {
  const art = COVERS[kind];
  if (!art) return null;
  const mark = brandFor(brand || BRAND_BY_KIND[kind]);
  return (
    <svg className="hb-game-cover hb-module-cover" width={width} height={height} viewBox="0 0 44 24" role="img" aria-label={`${kind} cover`} data-cover={kind}>
      <rect x="0.5" y="0.5" width="43" height="23" rx="3" fill="var(--surface-sunken)" stroke="var(--hairline)" />
      {art}
      <BrandMark brand={mark} />
    </svg>
  );
}

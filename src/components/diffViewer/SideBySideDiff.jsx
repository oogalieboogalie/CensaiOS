/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

function Cell({ side, row }) {
  const cell = row[side];
  if (!cell) return <div className="gdv-cell gdv-cell--empty" aria-hidden="true"><span className="gdv-n" /></div>;
  const tone = row.type === 'add' && side === 'right' ? 'add' : row.type === 'del' ? (side === 'right' ? 'del' : 'was') : 'same';
  return (
    <div className={`gdv-cell gdv-cell--${tone}`}>
      <span className="gdv-n">{cell.n ?? (tone === 'del' ? '−' : '')}</span>
      <span className="gdv-text">{cell.text || ' '}</span>
    </div>
  );
}

function Pane({ side, rows, label }) {
  return (
    <div className={`gdv-pane gdv-pane--${side}`} data-testid={`gdv-pane-${side}`}>
      <div className="gdv-pane-label">{label}</div>
      <div className="gdv-pane-body">
        {rows.map((row, i) => (row.type === 'gap'
          ? <div key={i} className="gdv-gap">{side === 'left' ? row.label : ' '}</div>
          : <Cell key={i} side={side} row={row} />))}
      </div>
    </div>
  );
}

/**
 * The side-by-side view from diagram 16: before on the left, after on the
 * right, a red line between. Both panes scroll together so rows stay level.
 */
export function SideBySideDiff({ rows, beforeLabel = 'Before', afterLabel = 'After', compact = false }) {
  return (
    <div className={`gdv-split${compact ? ' gdv-split--compact' : ''}`} data-testid="gdv-split">
      <Pane side="left" rows={rows} label={beforeLabel} />
      <div className="gdv-divider" aria-hidden="true" />
      <Pane side="right" rows={rows} label={afterLabel} />
    </div>
  );
}

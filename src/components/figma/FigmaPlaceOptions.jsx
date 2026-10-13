import React from 'react';

function pill(active) {
  return {
    all: 'unset', cursor: 'pointer', padding: '5px 11px', borderRadius: 'var(--radius-full)', font: '500 12px var(--font-sans)',
    whiteSpace: 'nowrap',
    color: active ? 'var(--accent-ink)' : 'var(--ink-soft)',
    background: active ? 'var(--accent-soft)' : 'transparent',
  };
}

// Narrow the frame grid to one page of the file.
export function FigmaPageTabs({ pages, value, onChange }) {
  return (
    <div role="tablist" aria-label="Figma pages" style={{ display: 'flex', gap: 4, overflowX: 'auto', flexShrink: 0 }}>
      {['', ...pages].map(page => (
        <button key={page || 'all'} type="button" role="tab" aria-selected={value === page} onClick={() => onChange(page)} style={pill(value === page)}>
          {page || 'All pages'}
        </button>
      ))}
    </div>
  );
}

const PLACE_OPTIONS = [
  { id: 'code', label: 'Code', hint: 'Live HTML any model can edit. Mostly-vector frames start on Figma\'s render.' },
  { id: 'image', label: 'Image', hint: 'Figma\'s own render. Flip a block to its code any time.' },
];

// How picked frames land on the canvas: editable code or a pixel render.
export function FigmaPlaceOptions({ value, onChange }) {
  const current = PLACE_OPTIONS.find(o => o.id === value) || PLACE_OPTIONS[0];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ font: '12px var(--font-sans)', color: 'var(--ink-faint)' }}>Place as</span>
      <div role="radiogroup" aria-label="Place as" style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 'var(--radius-full)', border: '1px solid var(--hairline)' }}>
        {PLACE_OPTIONS.map(option => (
          <button key={option.id} type="button" role="radio" aria-checked={current.id === option.id} onClick={() => onChange(option.id)} style={pill(current.id === option.id)}>
            {option.label}
          </button>
        ))}
      </div>
      <span style={{ font: '11px var(--font-sans)', color: 'var(--ink-faint)', flex: '1 1 160px' }}>{current.hint}</span>
    </div>
  );
}

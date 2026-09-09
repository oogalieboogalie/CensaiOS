import React from 'react';

export function IdeaToolbar({ expansion, onExpand, onClear, onNew, onSave, saving, assignee }) {
  return (
    <div style={{ display: 'flex', gap: 4, position: 'relative', zIndex: 5 }}>
      <button
        onClick={(e) => { e.stopPropagation(); onExpand(); }}
        style={titleButtonStyle('var(--accent-soft)', 'var(--accent-ink)')}
      >
        Expand
      </button>
      {expansion && (
        <button
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          style={titleButtonStyle('transparent', 'var(--ink-faint)')}
        >
          Clear
        </button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onNew(); }}
        style={titleButtonStyle('transparent', 'var(--ink-faint)')}
      >
        New
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onSave(); }}
        style={titleButtonStyle('var(--ink)', 'var(--surface)')}
      >
        {saving ? 'Saving...' : assignee ? 'Save + Handoff' : 'Save'}
      </button>
    </div>
  );
}

function titleButtonStyle(background, color) {
  return {
    all: 'unset',
    cursor: 'pointer',
    padding: '3px 8px',
    borderRadius: 6,
    background,
    color,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.02em',
  };
}

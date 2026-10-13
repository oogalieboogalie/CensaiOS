import React from 'react';
import { renderMarkdown } from '../../lib/renderMarkdown.jsx';

export function IdeaExpansionSection({ expansion, status, error, expansionStale, savedIdea }) {
  return (
    <section style={panelStyle}>
      <div style={sectionHeaderStyle}>
        <span>Expansion</span>
        <span>{status || 'Gemini 2.5 Flash'}</span>
      </div>
      {error && <div style={{ color: 'var(--ps-red)', fontSize: 'var(--text-sm)', lineHeight: 1.4, marginBottom: 8 }}>{error}</div>}
      {expansionStale && (
        <div style={{ color: 'var(--ink)', fontSize: 'var(--text-xs)', lineHeight: 1.45, marginBottom: 8, padding: 8, borderRadius: 'var(--radius-lg)', background: 'color-mix(in oklab, var(--ps-yellow) 18%, var(--surface-2))', border: '1px solid var(--hairline)' }}>
          This expansion belongs to an older bullet set. Save will only include the current bullets until you expand again.
        </div>
      )}
      {savedIdea && (
        <div style={{ color: 'var(--ps-green)', fontSize: 'var(--text-xs)', lineHeight: 1.4, marginBottom: 8, padding: 8, borderRadius: 'var(--radius-lg)', background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
          Saved as {savedIdea.tag}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', marginTop: 3 }}>{savedIdea.relativePath}</div>
          {savedIdea.task?.id && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ps-green)', marginTop: 3 }}>agent_tasks: {savedIdea.task.id}</div>
          )}
          {savedIdea.taskSkipped && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ps-orange)', marginTop: 3 }}>{savedIdea.taskSkipped}</div>
          )}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', color: 'var(--ink)', font: '13px/1.6 var(--font-sans)', paddingRight: 2 }}>
        {expansion ? renderMarkdown(expansion) : (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', textAlign: 'center', color: 'var(--ink-faint)', fontSize: 'var(--text-sm)', lineHeight: 1.55, padding: 18 }}>
            Add a few bullets, then hit Expand. This side becomes the expanded idea instead of a markdown preview.
          </div>
        )}
      </div>
    </section>
  );
}

const panelStyle = {
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  background: 'var(--surface)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-xl)',
  padding: 12,
  boxShadow: '0 12px 28px -24px oklch(0 0 0 / 0.35)',
};

const sectionHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-xs)',
  fontWeight: 800,
  textTransform: 'var(--label-case)',
  letterSpacing: 'var(--label-tracking)',
  color: 'var(--ink-faint)',
};

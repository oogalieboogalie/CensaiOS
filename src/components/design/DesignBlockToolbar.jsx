import React from 'react';

const TYPE_LABEL = { html: 'HTML', tailwind: 'Tailwind', react: 'React', svg: 'SVG', css: 'CSS' };

function ToolButton({ active, onClick, title, children }) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        all: 'unset', cursor: 'pointer', padding: '5px 10px', borderRadius: 'var(--radius-full)',
        font: '500 12px var(--font-sans)', whiteSpace: 'nowrap',
        color: active ? 'var(--accent-ink)' : 'var(--ink)',
        background: active ? 'var(--accent-soft)' : 'transparent',
      }}
    >
      {children}
    </button>
  );
}

// Floating pill that appears on a selected design block, Figma-style.
export function DesignBlockToolbar({
  sourceType, linked, hasRender, showRender, bare, canUndo, remixOpen,
  onOpenCode, onToggleRemix, onToggleRender, onToggleFrame, onUndo,
}) {
  return (
    <div
      role="toolbar"
      aria-label="Design block tools"
      style={{
        position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)', zIndex: 4,
        display: 'flex', alignItems: 'center', gap: 2, padding: 4, borderRadius: 'var(--radius-full)',
        background: 'var(--surface)', border: '1px solid var(--hairline)', boxShadow: 'var(--shadow-card)',
      }}
    >
      <span style={{ padding: '0 8px', font: '600 10px var(--font-mono)', letterSpacing: '0.06em', color: 'var(--ink-faint)', textTransform: 'uppercase' }}>
        {TYPE_LABEL[sourceType] || 'Code'}
      </span>
      <ToolButton active={linked} onClick={onOpenCode} title={linked ? 'Jump to the linked code editor' : 'Open this block in a live-linked code editor'}>
        Code
      </ToolButton>
      <ToolButton active={remixOpen} onClick={onToggleRemix} title="Ask any model to change this design">
        Remix with AI
      </ToolButton>
      {hasRender && (
        <ToolButton active={showRender} onClick={onToggleRender} title="Compare the live code with Figma's own render">
          {showRender ? 'Figma render' : 'Live code'}
        </ToolButton>
      )}
      {canUndo && <ToolButton onClick={onUndo} title="Restore the code from before the last remix">Undo</ToolButton>}
      <ToolButton active={!bare} onClick={onToggleFrame} title={bare ? 'Show a window frame around this block' : 'Make this block borderless'}>
        {bare ? 'Borderless' : 'Framed'}
      </ToolButton>
    </div>
  );
}

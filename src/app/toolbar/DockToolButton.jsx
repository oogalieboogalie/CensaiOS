import { DOCK } from './dockMetrics.js';

function restLook(base) {
  return { background: base, border: '1px solid transparent', boxShadow: 'none' };
}

// One round tool button. Active keeps the accent fill so the chosen tool
// stays obvious. Hover is a soft tint and never a glow.
export function DockToolButton({ tool, activeTool, expanded, accent = false, onClick, onHint }) {
  const active = activeTool === tool.id;
  return (
    <button
      type="button"
      data-tool={tool.id}
      title={`${tool.label} (${tool.key})`}
      tabIndex={expanded ? undefined : -1}
      onClick={onClick}
      onMouseEnter={(e) => {
        onHint(`${tool.label} (${tool.key})`);
        if (!active) {
          Object.assign(e.currentTarget.style, restLook('var(--glass-hover)'));
          e.currentTarget.style.color = 'var(--accent-ink)';
        }
      }}
      onMouseLeave={(e) => {
        onHint(null);
        if (!active) {
          Object.assign(e.currentTarget.style, restLook('transparent'));
          e.currentTarget.style.color = accent ? 'var(--accent-ink)' : 'var(--ink-soft)';
        }
      }}
      style={{
        all: 'unset', cursor: 'pointer', position: 'relative',
        width: DOCK.button, height: DOCK.button, borderRadius: '50%',
        display: 'grid', placeItems: 'center',
        color: active ? 'var(--accent-ink)' : (accent ? 'var(--accent-ink)' : 'var(--ink-soft)'),
        ...(active
          ? {
              background: 'var(--accent-soft)',
              border: '1px solid transparent',
              boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.15), 0 1px 2px oklch(0 0 0 / 0.08)',
            }
          : restLook('transparent')),
        fontWeight: active ? 600 : undefined,
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      <svg width={DOCK.icon} height={DOCK.icon} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={DOCK.stroke}>
        {tool.glyph}
      </svg>
      {tool.id === 'ai-agent' && (
        <span style={{ position: 'absolute', top: 2, right: 2, width: 6, height: 6, borderRadius: '50%', background: 'var(--ps-green)', boxShadow: '0 0 0 1.5px var(--surface)' }} />
      )}
    </button>
  );
}

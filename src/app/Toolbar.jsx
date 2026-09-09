import React from 'react';
import { AI_DEF, PEN_COLORS, PEN_SIZES, TOOL_DEFS, broadcastToolChange, isEditingTarget } from './toolbarDefs.jsx';

// Floating capsule multi-tool dock. Same props contract as the old toolbar
// so AppContent needs no changes. Engine tools go through onSelectTool +
// a `canvas:tool-change` CustomEvent; the AI button is a momentary action
// via onAiAgent (it never becomes the active tool).
//
// Idle state is a compact dark "Tools" pill. Hovering pops the full bar
// out of the top of the pill — the pill stays put as the anchor and the
// bar unfolds above it via an animated grid row.
export function Toolbar({ activeTool, onSelectTool, penColor, setPenColor, penSize, setPenSize, focusMode, onAiAgent }) {
  const [hint, setHint] = React.useState('Select Tool');
  const [hintVisible, setHintVisible] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);

  const activeDef = TOOL_DEFS.find((t) => t.id === activeTool) || TOOL_DEFS[0];

  const selectTool = React.useCallback((id) => {
    onSelectTool(id);
    broadcastToolChange(id);
  }, [onSelectTool]);

  const fireAiAgent = React.useCallback(() => {
    broadcastToolChange('ai-agent');
    onAiAgent?.();
  }, [onAiAgent]);

  // Keyboard shortcuts. Skipped while typing; Space stays reserved for pan-hold.
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isEditingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      const byKey = [...TOOL_DEFS, AI_DEF].find((t) => t.key.toLowerCase() === k)
        || (k === 'b' ? TOOL_DEFS.find((t) => t.id === 'pen') : null);
      if (!byKey) return;
      e.preventDefault();
      if (byKey.id === 'ai-agent') fireAiAgent();
      else selectTool(byKey.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectTool, fireAiAgent]);

  const showPenOptions = activeTool === 'pen' || activeTool === 'rect';

  const renderToolButton = (t, { accent = false } = {}) => {
    const active = activeTool === t.id;
    return (
      <button
        key={t.id}
        type="button"
        data-tool={t.id}
        title={`${t.label} (${t.key})`}
        tabIndex={expanded ? undefined : -1}
        onClick={() => (t.id === 'ai-agent' ? fireAiAgent() : selectTool(t.id))}
        onMouseEnter={(e) => {
          setHint(`${t.label} (${t.key})`);
          setHintVisible(true);
          if (!active) {
            e.currentTarget.style.background = 'var(--surface-2)';
            e.currentTarget.style.color = 'var(--accent-ink)';
          }
        }}
        onMouseLeave={(e) => {
          setHintVisible(false);
          if (!active) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = accent ? 'var(--accent-ink)' : 'var(--ink-soft)';
          }
        }}
        style={{
          all: 'unset', cursor: 'pointer', position: 'relative',
          width: 40, height: 40, borderRadius: '50%',
          display: 'grid', placeItems: 'center',
          color: active ? 'var(--accent-ink)' : (accent ? 'var(--accent-ink)' : 'var(--ink-soft)'),
          background: active ? 'var(--accent-soft)' : 'transparent',
          fontWeight: active ? 600 : undefined,
          boxShadow: active ? '0 1px 2px oklch(0 0 0 / 0.08)' : 'none',
          transition: 'background 0.15s, color 0.15s',
        }}
      >
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          {t.glyph}
        </svg>
        {t.id === 'ai-agent' && (
          <span style={{ position: 'absolute', top: 5, right: 5, width: 8, height: 8, borderRadius: '50%', background: 'var(--ps-green)', boxShadow: '0 0 0 2px var(--surface)' }} />
        )}
      </button>
    );
  };

  return (
    <div
      id="canvas-multitool-dock"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center"
      aria-expanded={expanded}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{ opacity: focusMode ? 0 : 1, transition: 'opacity 0.4s', pointerEvents: focusMode ? 'none' : 'auto' }}
    >
      <div
        id="tool-tooltip"
        className="mb-2.5 px-3 py-1 text-xs font-semibold rounded-full backdrop-blur-md pointer-events-none transition-all duration-200"
        style={{
          background: 'color-mix(in oklab, var(--ink) 80%, transparent)',
          color: 'var(--surface)',
          opacity: hintVisible ? 1 : 0,
          boxShadow: 'var(--shadow-card)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {hint}
      </div>

      <div
        data-testid="dock-capsule-full"
        style={{
          display: 'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.28s cubic-bezier(.4,0,.2,1)',
          justifyItems: 'center',
        }}
      >
        <div
          style={{
            overflow: 'hidden', minHeight: 0,
            opacity: expanded ? 1 : 0,
            transform: expanded ? 'translateY(0) scale(1)' : 'translateY(10px) scale(0.96)',
            transformOrigin: 'bottom center',
            transition: 'opacity 0.2s ease, transform 0.28s cubic-bezier(.4,0,.2,1)',
          }}
        >
          <div className="flex flex-col items-center" style={{ gap: 8, paddingBottom: 8 }}>
            {showPenOptions && (
              <div
                className="flex items-center rounded-full backdrop-blur-xl"
                style={{ gap: 8, padding: '8px 12px', background: 'color-mix(in oklab, var(--surface) 88%, transparent)', border: '1px solid var(--hairline)', boxShadow: 'var(--shadow-card)' }}
              >
                <div className="flex items-center" style={{ gap: 4 }}>
                  {PEN_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      title={`Pen color ${c}`}
                      onClick={() => setPenColor(c)}
                      style={{
                        all: 'unset', cursor: 'pointer',
                        width: 22, height: 22, borderRadius: '50%',
                        background: c,
                        border: '2px solid transparent',
                        boxShadow: penColor === c ? '0 0 0 1px var(--ink-soft)' : 'inset 0 0 0 1px oklch(0 0 0 / 0.12)',
                        transform: penColor === c ? 'scale(1.15)' : 'scale(1)',
                        transition: 'transform 0.1s',
                      }}
                    />
                  ))}
                </div>
                <div style={{ width: 1, height: 20, background: 'var(--hairline)' }} />
                <div className="flex items-center" style={{ gap: 4 }}>
                  {PEN_SIZES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      title={`Pen size ${s}`}
                      onClick={() => setPenSize(s)}
                      style={{
                        all: 'unset', cursor: 'pointer',
                        width: 24, height: 24, borderRadius: 6,
                        display: 'grid', placeItems: 'center',
                        background: penSize === s ? 'var(--surface-2)' : 'transparent',
                      }}
                    >
                      <div style={{ width: s * 1.5, height: s * 1.5, borderRadius: '50%', background: 'var(--ink)' }} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <nav
              aria-label="Canvas tools"
              className="relative flex items-center backdrop-blur-xl rounded-full"
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-pop)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-card)'; }}
              style={{
                gap: 6, padding: 6,
                background: 'color-mix(in oklab, var(--surface) 82%, transparent)',
                border: '1px solid var(--hairline)',
                boxShadow: 'var(--shadow-card)',
                transition: 'box-shadow 0.3s',
              }}
            >
              {renderToolButton(TOOL_DEFS[0])}
              {renderToolButton(TOOL_DEFS[1])}
              <div style={{ width: 1, height: 20, background: 'var(--hairline)', margin: '0 2px' }} />
              {renderToolButton(TOOL_DEFS[2])}
              {renderToolButton(TOOL_DEFS[3])}
              {renderToolButton(TOOL_DEFS[4])}
              {renderToolButton(TOOL_DEFS[5])}
              <div style={{ width: 1, height: 20, background: 'var(--hairline)', margin: '0 2px' }} />
              {renderToolButton(AI_DEF, { accent: true })}
            </nav>
          </div>
        </div>
      </div>

      <button
        type="button"
        data-testid="dock-capsule-mini"
        title="Tools"
        aria-label="Expand tools"
        onClick={() => setExpanded(true)}
        onFocus={() => setExpanded(true)}
        className="flex items-center backdrop-blur-xl rounded-full"
        style={{
          gap: 8, padding: '8px 14px',
          background: 'color-mix(in oklab, var(--surface) 88%, transparent)',
          color: 'var(--ink-soft)',
          border: '1px solid var(--hairline)',
          boxShadow: 'var(--shadow-card)',
          fontFamily: 'var(--font-sans)',
          fontSize: 12, fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          {activeDef.glyph}
        </svg>
        <span>Tools</span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s' }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ps-green)' }} />
      </button>
    </div>
  );
}

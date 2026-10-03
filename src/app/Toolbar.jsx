import React from 'react';
import { AI_DEF, CHAT_DEF, TOOL_DEFS, broadcastToolChange, isEditingTarget } from './toolbarDefs.jsx';
import { PenOptions } from './toolbar/PenOptions.jsx';
import { DockPresence } from './DockPresence.jsx';
import { DockChat } from './toolbar/DockChat.jsx';
import { GLOSS_SHEEN, glossContainer } from '../lib/theme/gloss.js';

// Floating capsule multi-tool dock. Same props contract as the old toolbar
// so AppContent needs no changes. Engine tools go through onSelectTool +
// a `canvas:tool-change` CustomEvent. AI Copilot is a momentary action via
// onAiAgent; Chat lives in DockChat (pick an agent, thread).
//
// Idle state is a compact dark "Tools" pill. Hovering pops the full bar
// out of the top of the pill — the pill stays put as the anchor and the
// bar unfolds above it via an animated grid row.
export function Toolbar({ activeTool, onSelectTool, penColor, setPenColor, penSize, setPenSize, focusMode, onAiAgent, collaboration, onShare, workspaceId }) {
  const [hint, setHint] = React.useState('Select Tool');
  const [hintVisible, setHintVisible] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);

  const activeDef = TOOL_DEFS.find((t) => t.id === activeTool) || TOOL_DEFS[0];

  const selectTool = React.useCallback((id) => {
    onSelectTool(id);
    broadcastToolChange(id);
  }, [onSelectTool]);

  const fireAction = React.useCallback((id, fn) => {
    broadcastToolChange(id);
    fn?.();
  }, []);

  // Keyboard shortcuts. Skipped while typing; Space stays reserved for pan-hold.
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isEditingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      const byKey = [...TOOL_DEFS, AI_DEF].find((t) => t.key.toLowerCase() === k)
        || (k === 'b' ? TOOL_DEFS.find((t) => t.id === 'pen') : null);
      if (!byKey) return;
      e.preventDefault();
      if (byKey.id === 'ai-agent') fireAction('ai-agent', onAiAgent);
      else selectTool(byKey.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectTool, fireAction, onAiAgent]);

  const showPenOptions = activeTool === 'pen' || activeTool === 'rect';

  // Glossy resting treatment (themed): faint top sheen over the surface,
  // hairline rim, bevel insets, soft drop. Active keeps its accent fill.
  const glossyRest = (base) => ({
    background: `linear-gradient(to bottom, oklch(1 0 0 / 0.10), oklch(0 0 0 / 0.08)), ${base}`,
    border: '1px solid var(--hairline)',
    boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.12), 0 2px 6px oklch(0 0 0 / 0.18)',
  });

  const renderToolButton = (t, { accent = false } = {}, onClickOverride) => {
    const active = activeTool === t.id;
    return (
      <button
        key={t.id}
        type="button"
        data-tool={t.id}
        title={`${t.label} (${t.key})`}
        tabIndex={expanded ? undefined : -1}
        onClick={onClickOverride ?? (() => (t.id === 'ai-agent' ? fireAction('ai-agent', onAiAgent) : selectTool(t.id)))}
        onMouseEnter={(e) => {
          setHint(`${t.label} (${t.key})`);
          setHintVisible(true);
          if (!active) {
            Object.assign(e.currentTarget.style, glossyRest('var(--surface-2)'));
            e.currentTarget.style.color = 'var(--accent-ink)';
          }
        }}
        onMouseLeave={(e) => {
          setHintVisible(false);
          if (!active) {
            Object.assign(e.currentTarget.style, glossyRest('var(--surface)'));
            e.currentTarget.style.color = accent ? 'var(--accent-ink)' : 'var(--ink-soft)';
          }
        }}
        style={{
          all: 'unset', cursor: 'pointer', position: 'relative',
          width: 40, height: 40, borderRadius: '50%',
          display: 'grid', placeItems: 'center',
          color: active ? 'var(--accent-ink)' : (accent ? 'var(--accent-ink)' : 'var(--ink-soft)'),
          ...(active
            ? {
                background: 'var(--accent-soft)',
                border: '1px solid transparent',
                boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.15), 0 1px 2px oklch(0 0 0 / 0.08)',
              }
            : glossyRest('var(--surface)')),
          fontWeight: active ? 600 : undefined,
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
        className="mb-2.5 px-3 py-1 text-xs font-semibold backdrop-blur-md pointer-events-none transition-all duration-200"
        style={{
          background: 'color-mix(in oklab, var(--ink) 80%, transparent)',
          color: 'var(--surface)',
          borderRadius: 'var(--radius-float-sm)',
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
              <PenOptions penColor={penColor} setPenColor={setPenColor} penSize={penSize} setPenSize={setPenSize} />
            )}

            <nav
              aria-label="Canvas tools"
              className="relative flex items-center backdrop-blur-xl"
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-pop)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-card)'; }}
              style={{
                gap: 6, padding: 6,
                background: `${GLOSS_SHEEN}, color-mix(in oklab, var(--surface) 82%, transparent)`,
                border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-float)',
                boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.12), var(--shadow-card)',
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
              {<DockChat renderButton={(onClick) => renderToolButton(CHAT_DEF, { accent: true }, onClick)} />}
            </nav>

            {collaboration && <DockPresence collaboration={collaboration} onShare={onShare} workspaceId={workspaceId} expanded={expanded} />}
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
        className="flex items-center backdrop-blur-xl"
        style={glossContainer({
          gap: 8, padding: '8px 14px',
          background: `${GLOSS_SHEEN}, color-mix(in oklab, var(--surface) 88%, transparent)`,
          color: 'var(--ink-soft)',
          borderRadius: 'var(--radius-float)',
          fontFamily: 'var(--font-sans)',
          fontSize: 12, fontWeight: 600,
          cursor: 'pointer',
        })}
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

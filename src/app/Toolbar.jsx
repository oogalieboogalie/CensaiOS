import React from 'react';
import { AI_DEF, CHAT_DEF, TOOL_DEFS, broadcastToolChange, isEditingTarget } from './toolbarDefs.jsx';
import { PenOptions } from './toolbar/PenOptions.jsx';
import { DockPresence } from './DockPresence.jsx';
import { DockChat } from './toolbar/DockChat.jsx';
import { DockDivider } from './toolbar/DockDivider.jsx';
import { DockToolButton } from './toolbar/DockToolButton.jsx';
import { loadDockExtras } from './toolbar/dockExtras.js';
import { DOCK, DOCK_PAD } from './toolbar/dockMetrics.js';
import { GLASS_HOST, GLOSS_SHEEN, glossContainer } from '../lib/theme/gloss.js';
import { keyboardClaimed } from '../lib/keyboardClaim.js';

const NAVIGATE = new Set(['select', 'pan']);
const PEN_TOOLS = new Set(['pen', 'rect']);

// Floating capsule multi-tool dock. Same props contract as the old toolbar
// so AppContent needs no changes. Engine tools go through onSelectTool +
// a `canvas:tool-change` CustomEvent. AI Copilot is a momentary action via
// onAiAgent; Chat lives in DockChat (pick an agent, thread).
//
// Idle state is a compact "Tools" pill. Hovering pops the full bar out of
// the top of the pill — the pill stays put and the bar unfolds above it.
export function Toolbar({ activeTool, onSelectTool, penColor, setPenColor, penSize, setPenSize, focusMode, onAiAgent, collaboration, onShare, workspaceId }) {
  const [hint, setHint] = React.useState('Select Tool');
  const [hintVisible, setHintVisible] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const extras = React.useMemo(() => loadDockExtras(), []);

  const activeDef = TOOL_DEFS.find((t) => t.id === activeTool) || TOOL_DEFS[0];
  const hidden = new Set(extras.flatMap((mod) => mod.claimedTools || []));
  const penTools = new Set([...PEN_TOOLS, ...extras.flatMap((mod) => mod.penOptionTools || [])]);
  const navigate = TOOL_DEFS.filter((t) => NAVIGATE.has(t.id) && !hidden.has(t.id));
  const draw = TOOL_DEFS.filter((t) => !NAVIGATE.has(t.id) && !hidden.has(t.id));

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
      if (e.metaKey || e.ctrlKey || e.altKey || isEditingTarget(e.target) || keyboardClaimed()) return;
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

  const showHint = (text) => {
    setHint(text || 'Select Tool');
    setHintVisible(Boolean(text));
  };

  const renderToolButton = (t, { accent = false } = {}, onClickOverride) => (
    <DockToolButton
      key={t.id}
      tool={t}
      activeTool={activeTool}
      expanded={expanded}
      accent={accent}
      onHint={showHint}
      onClick={onClickOverride ?? (() => (t.id === 'ai-agent' ? fireAction('ai-agent', onAiAgent) : selectTool(t.id)))}
    />
  );

  const extraProps = { activeTool, expanded, penColor, setPenColor, penSize, setPenSize, renderToolButton, selectTool };

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
          <div className="flex flex-col items-center" style={{ gap: DOCK.gap, paddingBottom: DOCK.gap }}>
            {penTools.has(activeTool) && (
              <PenOptions penColor={penColor} setPenColor={setPenColor} penSize={penSize} setPenSize={setPenSize} />
            )}
            {extras.map((mod, i) => (mod.DockAbove ? <mod.DockAbove key={`above-${i}`} {...extraProps} /> : null))}

            <nav
              aria-label="Canvas tools"
              className={`relative flex items-center ${GLASS_HOST}`}
              style={{
                gap: DOCK.gap, padding: DOCK_PAD,
                background: `${GLOSS_SHEEN}, var(--glass-bg)`,
                border: '1px solid var(--glass-line)',
                borderRadius: 'var(--radius-float)',
                boxShadow: 'var(--glass-shadow)',
              }}
            >
              {navigate.map((t) => renderToolButton(t))}
              <DockDivider />
              {draw.map((t) => renderToolButton(t))}
              {extras.map((mod, i) => (mod.DockButtons ? <mod.DockButtons key={`buttons-${i}`} {...extraProps} /> : null))}
              <DockDivider />
              {renderToolButton(AI_DEF, { accent: true })}
              <DockChat renderButton={(onClick) => renderToolButton(CHAT_DEF, { accent: true }, onClick)} />
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
        className={`flex items-center ${GLASS_HOST}`}
        style={glossContainer({
          gap: DOCK.gap, padding: `${DOCK.padY}px 12px`,
          minHeight: DOCK.button, boxSizing: 'border-box',
          color: 'var(--ink-soft)',
          borderRadius: 'var(--radius-float)',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-sm)', fontWeight: 600,
          cursor: 'pointer',
        })}
      >
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={DOCK.stroke}>
          {activeDef.glyph}
        </svg>
        <span>Tools</span>
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s' }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ps-green)' }} />
      </button>
    </div>
  );
}

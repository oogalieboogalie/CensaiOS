import React from 'react';
import { AgentAvatar } from '../Agents.jsx';
import { getAgentById } from '../../lib/agentStore.js';
import { DEFAULT_THEME, MOODS, useTheme } from '../Theme.jsx';
import { WindowChromeContext } from './windowChromeContext.js';

export function WindowTitle({ icon, label, accent, subtitle, agent, attachedAgentIds, onDetach, children }) {
  const attached = (attachedAgentIds || []).map(id => getAgentById(id)).filter(Boolean);
  const themeContext = useTheme();
  const theme = themeContext?.theme || DEFAULT_THEME;
  const mood = MOODS[theme.mood] || MOODS.cream;
  // Per-window override wins when the frame provides one (win.chromeVariant);
  // otherwise fall back to the mood's traffic-light request. Null context =
  // title rendered outside a frame, keep historical behavior.
  const chromeCtx = React.useContext(WindowChromeContext);
  const moodTrafficLights = mood.vars?.['--window-extra-controls-display'] !== 'none'
    && mood.vars?.['--window-extra-controls-display'] !== undefined;
  const usesTrafficLights = chromeCtx?.trafficControls ?? moodTrafficLights;
  // Full win98 header skin: solid bar (navy active, gray inactive), white
  // bold sans text. Everything else keeps the low-profile rail.
  const isWin98 = chromeCtx?.chromeVariant === 'win98';
  const isFrameActive = chromeCtx?.isActive ?? true;
  const titleBackground = isWin98
    ? (isFrameActive ? 'var(--window-title-bg, var(--accent))' : 'var(--hairline)')
    : (accent
      ? `color-mix(in oklab, ${accent} 15%, var(--surface-2))`
      : 'var(--window-title-bg, color-mix(in oklab, var(--window-accent, var(--accent)) 12%, var(--surface-2)))');
  const washOpacity = isWin98 ? 1 : (usesTrafficLights ? 0.46 : 0.28);

  return (
    <div
      data-window-title-rail="low-profile"
      data-chrome-header={isWin98 ? 'win98' : 'low-profile'}
      data-traffic-controls={usesTrafficLights ? 'true' : 'false'}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: isWin98 ? '4px 76px 4px 8px' : (usesTrafficLights ? '6px 60px 6px 72px' : '6px 84px 6px 12px'),
        minHeight: isWin98 ? 24 : 28, boxSizing: 'border-box',
        fontFamily: isWin98 ? 'var(--font-sans)' : 'var(--font-mono)',
        fontSize: isWin98 ? 12 : 10.5, letterSpacing: isWin98 ? '0.02em' : '0.07em',
        textTransform: isWin98 ? 'none' : 'uppercase',
        fontWeight: isWin98 ? 700 : undefined,
        color: isWin98 ? 'oklch(1 0 0)' : 'var(--ink-soft)', borderBottomWidth: 0,
        flexShrink: 0, position: 'relative', zIndex: 4, pointerEvents: 'none',
        backdropFilter: 'var(--window-title-backdrop, none)',
        WebkitBackdropFilter: 'var(--window-title-backdrop, none)',
      }}
    >
      <span aria-hidden="true" data-window-title-wash style={{
        position: 'absolute', inset: 0, zIndex: 0,
        background: titleBackground,
        opacity: washOpacity,
        pointerEvents: 'none',
      }} />
      {agent && <div style={{ pointerEvents: 'auto', position: 'relative', zIndex: 1, flexShrink: 0 }}><AgentAvatar agent={agent} size={16} /></div>}
      {icon && !agent && <span style={{ color: isWin98 ? 'oklch(1 0 0)' : (accent || 'var(--accent-ink)'), position: 'relative', zIndex: 1, display: 'flex', flexShrink: 0 }}>{icon}</span>}
      <div data-window-title-copy style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, overflow: 'hidden', position: 'relative', zIndex: 1 }}>
        <span style={{ pointerEvents: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '0 1 auto' }}>{label}</span>
        {subtitle && <span style={{ textTransform: 'none', letterSpacing: 0, color: isWin98 ? 'oklch(1 0 0 / 0.8)' : 'var(--ink-faint)', fontWeight: 400, pointerEvents: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 4 auto' }}>· {subtitle}</span>}
      </div>
      {attached.length > 0 && <div style={{ display: 'flex', gap: 4, pointerEvents: 'auto', position: 'relative', zIndex: 1, flexShrink: 0 }}>
        {attached.map(a => <div key={a.id} title={`${a.name} attached — click to detach`} onClick={(e) => { e.stopPropagation(); onDetach?.(a.id); }} style={{ cursor: 'pointer' }}><AgentAvatar agent={a} size={18} ring /></div>)}
      </div>}
      {children && <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 6, position: 'relative', zIndex: 1, flexShrink: 0 }}>{children}</div>}
    </div>
  );
}

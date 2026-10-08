import React from 'react';
import { createPortal } from 'react-dom';
import { AgentAvatar } from '../Agents.jsx';
import { getAgentById } from '../../lib/agentStore.js';
import { WindowChromeContext } from './windowChromeContext.js';
import { cleanHeaderText, splitHeaderActions } from '../../lib/windowHeader.js';

/** A data-declared header action: `{ id, label, icon, onSelect, pressed, title }`. */
function HeaderAction({ label, icon, onSelect, pressed, title, inMenu }) {
  return (
    <button type="button" className={inMenu ? 'hb-win-menu-item' : 'hb-win-action'}
      role={inMenu ? 'menuitem' : undefined}
      aria-pressed={inMenu || pressed === undefined ? undefined : Boolean(pressed)}
      title={title || (typeof label === 'string' ? label : undefined)}
      // Keep focus where it is (an editor's blur must not race the action).
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => { e.stopPropagation(); onSelect?.(e); }}>
      {icon}{label && <span>{label}</span>}
    </button>
  );
}

/**
 * What a window puts in its header. It does not draw a title bar: inside a
 * WindowFrame it portals into the frame's shared header (WindowHeader.jsx).
 *
 *   icon, label, subtitle, agent, attachedAgentIds/onDetach  → title slot
 *   actions  data actions; the first three show inline, the rest overflow
 *   children custom inline controls, counted against the same three
 *   menu     items that always live in the overflow menu
 *
 * Outside a frame (tests, the window lab) it renders a plain row.
 */
export function WindowTitle({ icon, label, accent, subtitle, agent, attachedAgentIds, onDetach, actions, menu, children }) {
  const chrome = React.useContext(WindowChromeContext);
  const claimTitle = chrome?.claimTitle;
  React.useLayoutEffect(() => claimTitle?.(), [claimTitle]);

  const attached = (attachedAgentIds || []).map(id => getAgentById(id)).filter(Boolean);
  const items = [
    ...(actions || []).filter(Boolean).map((a, i) => <HeaderAction key={a.id || `action-${i}`} {...a} />),
    ...React.Children.toArray(children).filter(Boolean),
  ];
  const { inline, overflow } = splitHeaderActions(items);
  const menuItems = [
    // Data actions that spill over render as menu items; custom children move as-is.
    ...overflow.map((el) => (React.isValidElement(el) && el.type === HeaderAction ? React.cloneElement(el, { inMenu: true }) : el)),
    ...(menu || []).filter(Boolean).map((m, i) => <HeaderAction key={m.id || `menu-${i}`} {...m} inMenu />),
  ];

  const titleNode = (
    <>
      {agent && <span className="hb-win-identity"><AgentAvatar agent={agent} size={16} /></span>}
      {icon && !agent && <span className="hb-win-identity" data-window-identity style={accent ? { color: accent } : undefined}>{icon}</span>}
      <span className="hb-win-label">{cleanHeaderText(label)}</span>
      {subtitle && <span className="hb-win-subtitle">{cleanHeaderText(subtitle)}</span>}
      {attached.length > 0 && (
        <span className="hb-win-agents">
          {attached.map(a => (
            <span key={a.id} title={`${a.name} attached. Click to detach.`} data-no-drag
              onClick={(e) => { e.stopPropagation(); onDetach?.(a.id); }} style={{ cursor: 'pointer' }}>
              <AgentAvatar agent={a} size={18} ring />
            </span>
          ))}
        </span>
      )}
    </>
  );

  const slots = chrome?.slots;
  if (!slots) {
    return (
      <div className="hb-win-header" data-window-title-rail="standalone">
        <div className="hb-win-title" data-window-title-copy>{titleNode}</div>
        <div className="hb-win-actions">{inline}{menuItems}</div>
      </div>
    );
  }
  return (
    <>
      {slots.title && createPortal(titleNode, slots.title)}
      {slots.actions && inline.length > 0 && createPortal(inline, slots.actions)}
      {slots.menu && menuItems.length > 0 && createPortal(menuItems, slots.menu)}
    </>
  );
}

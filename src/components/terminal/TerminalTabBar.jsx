import React from 'react';
import { Icon } from '../Icons.jsx';
import { tabLabel } from './terminalTabs.js';

// The tab strip under the title bar. It only shows once there are two or
// more tabs; the + in the title bar opens the second one.
export function TerminalTabBar({ win, tabs, activeId, onSelect, onClose, onAdd, theme }) {
  if (tabs.length < 2) return null;
  return (
    <div className="terminal-tabs" role="tablist" aria-label="Terminal tabs" 
      style={{ '--term-bg': theme.background, '--term-fg': theme.foreground }}>
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          role="tab"
          tabIndex={0}
          aria-selected={tab.id === activeId}
          className="terminal-tab"
          title={`${tabLabel(win, tab, index)} (Ctrl+Tab to switch)`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onSelect(tab.id)}
          onAuxClick={(e) => { if (e.button === 1) onClose(tab.id); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(tab.id); }}
        >
          <span className="terminal-tab-name">{tabLabel(win, tab, index)}</span>
          <button
            type="button"
            className="terminal-tab-close"
            title="Close this tab (Ctrl+Shift+W)"
            aria-label={`Close ${tabLabel(win, tab, index)}`}
            onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
          >
            <Icon.Close size={10} />
          </button>
        </div>
      ))}
      <button type="button" className="terminal-tab-add" title="New tab (Ctrl+Shift+T)" aria-label="New tab"
        onPointerDown={(e) => e.stopPropagation()} onClick={onAdd}>
        <Icon.Plus size={12} />
      </button>
    </div>
  );
}

// Windows Terminal keys. They work in the desktop app; a web browser keeps
// some of them (Ctrl+Shift+T, Ctrl+Tab) for its own tabs.
export function terminalTabKeyAction(event) {
  if (!event.ctrlKey || event.altKey || event.metaKey) return null;
  const key = String(event.key || '').toLowerCase();
  if (event.shiftKey && key === 't') return 'add';
  if (event.shiftKey && key === 'w') return 'close';
  if (key === 'tab') return event.shiftKey ? 'prev' : 'next';
  if (key === 'pagedown') return 'next';
  if (key === 'pageup') return 'prev';
  return null;
}

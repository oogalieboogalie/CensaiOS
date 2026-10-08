import React from 'react';
import { Icon } from '../Icons.jsx';
import { HEADER_MODES, HEADER_MODE_LABELS } from '../../lib/windowHeader.js';

const DRAG_HINT = 'Drag to move · double-click to maximize · right-click for window style · Alt-drag anywhere in the window';

function MenuItem({ children, onSelect, checked, title }) {
  return (
    <button type="button" role={checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={checked}
      className="hb-win-menu-item" title={title} onClick={onSelect}>
      {children}
    </button>
  );
}

/**
 * The one window header (spec 2). WindowFrame renders it for every window.
 *
 * Windows never draw their own title bar: WindowTitle.jsx portals the
 * window's title, icon and actions into the slots below. A window that
 * renders no WindowTitle still gets its manifest title and icon (`fallback`).
 *
 * Slots (DOM nodes handed to WindowTitle through WindowChromeContext):
 *   title    identity glyph + label + subtitle + attached agents
 *   actions  up to three inline actions
 *   menu     the window's overflow items, shown above the frame's own items
 */
export function WindowHeader({
  win, mode, traffic, chromeHeader, fallback, titleClaimed, slotRefs, headerRef,
  menuOpen, setMenuOpen, onClose, onUpdate, onOpenStyleMenu,
}) {
  const menuRef = React.useRef(null);
  React.useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      if (e.target.closest?.('[data-window-control="menu"]') && headerRef.current?.contains(e.target)) return;
      setMenuOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen, setMenuOpen, headerRef]);

  const FallbackIcon = fallback.icon && Icon[fallback.icon];
  const run = (fn) => (e) => { e.stopPropagation(); setMenuOpen(false); fn(); };
  // Overflowed window actions are arbitrary buttons: close the menu after
  // any of them runs, the same as a menu item.
  const closeAfterClick = (e) => {
    if (e.target.closest?.('button, a, [role="button"], [role="menuitem"]')) setTimeout(() => setMenuOpen(false), 0);
  };

  return (
    <div ref={headerRef} className="hb-win-header" data-window-header={mode}
      data-window-title-rail="low-profile" data-chrome-header={chromeHeader}
      data-traffic-controls={traffic ? 'true' : 'false'} title={win.pinned ? undefined : DRAG_HINT}>
      <span className="hb-win-grip" aria-hidden="true"><Icon.Drag size={12} /></span>
      <div className="hb-win-title" data-window-title-copy>
        {!titleClaimed && (
          <>
            {FallbackIcon && <span className="hb-win-identity" data-window-identity><FallbackIcon size={14} /></span>}
            <span className="hb-win-label">{fallback.title}</span>
          </>
        )}
        <span ref={slotRefs.title} className="hb-win-title-slot" />
      </div>
      <div ref={slotRefs.actions} className="hb-win-actions" data-window-actions />
      <div className="hb-win-controls">
        <button type="button" className="hb-win-control" data-window-control="menu" title="More window actions"
          aria-haspopup="menu" aria-expanded={menuOpen}
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
        </button>
        <button type="button" className="hb-win-control" data-window-control="maximize"
          title={win.maximized ? 'Restore window size' : 'Maximize window'}
          onClick={(e) => { e.stopPropagation(); onUpdate({ maximized: !win.maximized }); }}>
          {win.maximized ? <Icon.Restore size={12} /> : <Icon.Maximize size={12} />}
        </button>
        {win.closable !== false && (
          <button type="button" className="hb-win-control" data-window-control="close" title="Close window"
            onClick={(e) => { e.stopPropagation(); onClose(); }}>
            <Icon.Close size={12} stroke={2.2} />
          </button>
        )}
      </div>
      <div ref={menuRef} className="hb-win-menu" role="menu" aria-label="Window actions" hidden={!menuOpen}
        onPointerDown={(e) => e.stopPropagation()} onClickCapture={closeAfterClick}>
        <div ref={slotRefs.menu} className="hb-win-menu-section" data-window-menu />
        <div className="hb-win-menu-section">
          <MenuItem onSelect={run(() => onUpdate({ pinned: !win.pinned }))}>
            {win.pinned ? 'Unpin from screen' : 'Pin to screen'}
          </MenuItem>
          <MenuItem onSelect={run(onOpenStyleMenu)}>Window style…</MenuItem>
          {win.fontScale && win.fontScale !== 1 && (
            <MenuItem onSelect={run(() => onUpdate({ fontScale: 1 }))}>Reset text size</MenuItem>
          )}
        </div>
        {!win.bare && <div className="hb-win-menu-section">
          <span className="hb-win-menu-label">Header</span>
          <div className="hb-win-menu-row" role="group" aria-label="Header style">
            {HEADER_MODES.map((m) => (
              <MenuItem key={m} checked={mode === m} onSelect={run(() => onUpdate({ headerMode: m }))}>
                {HEADER_MODE_LABELS[m]}
              </MenuItem>
            ))}
          </div>
          {win.headerMode && (
            <MenuItem onSelect={run(() => onUpdate({ headerMode: undefined }))}>Use theme header</MenuItem>
          )}
        </div>}
      </div>
    </div>
  );
}

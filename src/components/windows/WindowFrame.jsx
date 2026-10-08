import React from 'react';
import { useTheme, DEFAULT_THEME, MOODS } from '../Theme.jsx';
import { WindowResizeHandles } from './WindowResizeHandles.jsx';
import { useWindowWheelContainment } from './useWindowWheelContainment.js';
import { useWindowFrameInteractions } from './useWindowFrameInteractions.js';
import { getAccentBorder } from '../../lib/canvasMath.js';
import { WindowStyleMenu } from './WindowStyleMenu.jsx';
import { RemoteWindowActor } from '../collaboration/RemoteWindowActor.jsx';
import { WindowChromeContext } from './windowChromeContext.js';
import { WindowHeader } from './WindowHeader.jsx';
import { getChromeVariant } from '../../lib/theme/chromeVariants.js';
import { normalizeShape, resolveMood } from '../../lib/theme/looks.js';
import { WINDOW_MANIFEST_BY_KIND, WINDOW_MANIFEST_BY_CANVAS_TYPE } from '../../lib/windowManifest.js';
import { resolveHeaderMeta, resolveHeaderMode } from '../../lib/windowHeader.js';
import { isHeaderDragTarget, isAltDragTarget } from './windowDragTargets.js';

// A tile in a group: only the group's outer corners stay rounded, so the
// tiles read as one card. `corners` lists them ('tl tr br bl').
function tileRadius(corners) {
  const set = new Set(String(corners || '').split(' '));
  const r = (key) => (set.has(key) ? 'var(--window-radius, var(--radius-window))' : '0');
  return `${r('tl')} ${r('tr')} ${r('br')} ${r('bl')}`;
}

export const WindowFrame = React.memo(({ win, onUpdate, onClose, onSelect, onDragEnd, onMovePreview, onWireStart, onWireDrag, onWireEnd, isActive, stackLevel = 0, isSelected = false, zoom = 1, pan = { x: 0, y: 0 }, allWins = [], tileGroupId = null, tileCorners = '', groupDrag = null, children, style = {} }) => {
  const renderCount = React.useRef(0);
  renderCount.current++;
  const ref = React.useRef(null);
  const headerRef = React.useRef(null);
  const themeContext = useTheme();
  const theme = themeContext?.theme || DEFAULT_THEME;
  const mood = resolveMood(theme, MOODS);
  // Per-window chrome variant (win.chromeVariant, set from WindowStyleMenu),
  // scoped as inline custom props so it never touches the global theme.
  const variantVars = getChromeVariant(win.chromeVariant)?.vars || {};
  const trafficVar = variantVars['--window-extra-controls-display'] ?? mood.vars?.['--window-extra-controls-display'];
  const usesTrafficLights = trafficVar !== undefined && trafficVar !== 'none';

  const manifest = WINDOW_MANIFEST_BY_KIND[win.kind] || WINDOW_MANIFEST_BY_CANVAS_TYPE[win.type];
  const headerMeta = resolveHeaderMeta(manifest);
  const headerMode = resolveHeaderMode({ ...win, headerMode: win.headerMode || headerMeta.mode }, normalizeShape(theme).headerMode);

  const [showColorMenu, setShowColorMenu] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const colorMenuRef = React.useRef(null);

  // Header slots: WindowTitle portals the window's title/actions/menu here.
  const [titleEl, setTitleEl] = React.useState(null);
  const [actionsEl, setActionsEl] = React.useState(null);
  const [menuEl, setMenuEl] = React.useState(null);
  const [titleClaims, setTitleClaims] = React.useState(0);
  const claimTitle = React.useCallback(() => {
    setTitleClaims(c => c + 1);
    return () => setTitleClaims(c => c - 1);
  }, []);

  React.useEffect(() => {
    if (!showColorMenu) return;
    const handleOutsideClick = (e) => {
      if (colorMenuRef.current && !colorMenuRef.current.contains(e.target)) setShowColorMenu(false);
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [showColorMenu]);
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    const handleWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      onUpdate({ fontScale: Math.max(0.7, Math.min(2.0, (win.fontScale || 1.0) + (-e.deltaY > 0 ? 0.05 : -0.05))) });
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [win.id, win.fontScale, onUpdate]);

  const [hoverChrome, setHoverChrome] = React.useState(false);
  useWindowWheelContainment(ref);
  const { startDrag, startResize, startWire, onPointerMove, onPointerUp } = useWindowFrameInteractions({
    win, onUpdate, onSelect, onDragEnd, onMovePreview, onWireStart, onWireDrag, onWireEnd, zoom, pan, theme, allWins, frameRef: ref, tileGroupId, groupDrag,
  });
  // Handles own their pointer streams; keep them from bubbling into the
  // frame-level move handler a second time.
  const ownMove = (e) => { e.stopPropagation(); onPointerMove(e); };
  const ownUp = (e) => { e.stopPropagation(); onPointerUp(e); };

  // Move from the header, or from anywhere with Alt held (not inside code
  // editors, where Alt-drag is rectangular selection).
  const onAltDown = (e) => {
    if (e.altKey && !e.button && !win.maximized && isAltDragTarget(e.target)) { e.preventDefault(); startDrag(e); }
  };
  const onFrameDown = (e) => {
    if (!e.button && isHeaderDragTarget(e.target, headerRef.current)) startDrag(e);
    else onSelect(e);
  };
  const inHeader = (e) => isHeaderDragTarget(e.target, headerRef.current);

  const accentBorder = getAccentBorder(win);
  // Focus = a stronger shadow plus a 1 px accent hairline. No glow, no 2 px ring.
  const frameBorder = isSelected ? 'var(--accent)' : (isActive ? 'var(--window-focus-hairline)' : 'var(--hairline)');
  // Tiles cast no shadow of their own; the group draws one under all of them.
  const tiled = !!tileGroupId && !win.maximized && !win.pinned;
  const frameShadow = tiled ? 'none' : (isActive ? 'var(--window-shadow-active, var(--elevation-3))' : 'var(--window-shadow, var(--shadow-card))');

  let frameStyle = {};
  if (win.maximized) {
    frameStyle = { position: 'fixed', left: 80, top: 72, right: 24, bottom: 24, width: 'auto', height: 'auto', zIndex: 100 };
  } else if (win.pinned) {
    frameStyle = { position: 'absolute', width: win.w * 0.75, height: win.h * 0.75, zIndex: 10 + stackLevel };
  } else {
    frameStyle = {
      position: 'absolute', left: 0, top: 0, width: win.w, height: win.h,
      transform: `translate(${pan.x + win.x * zoom}px, ${pan.y + win.y * zoom}px) scale(${zoom})`,
      transformOrigin: '0 0', zIndex: 10 + stackLevel,
    };
  }

  const isDark = mood.mode === 'dark';
  const winHue = win.hue !== undefined ? win.hue : theme.hue;
  // Frameless: content floats bare; chrome returns on hover/selection.
  const frameless = win.frameless === true;
  const chromeVisible = !frameless || hoverChrome || isActive || isSelected;
  // Bare (design blocks): the content is the whole window; selection shows only an outline.
  const bare = frameless && win.bare === true;
  const customizedBg = win.hue !== undefined || win.opacity !== undefined
    ? (isDark ? `oklch(0.22 0.02 ${winHue} / ${win.opacity ?? 0.85})` : `oklch(0.98 0.01 ${winHue} / ${win.opacity ?? 0.85})`)
    : 'var(--window-bg, var(--surface))';
  const customizedBackdrop = win.opacity !== undefined && win.opacity < 1 ? 'blur(12px) saturate(1.2)' : 'var(--window-backdrop, none)';

  const chrome = React.useMemo(() => ({
    chromeVariant: win.chromeVariant || null, trafficControls: usesTrafficLights, isActive, headerMode,
    slots: { title: titleEl, actions: actionsEl, menu: menuEl }, claimTitle,
  }), [win.chromeVariant, usesTrafficLights, isActive, headerMode, titleEl, actionsEl, menuEl, claimTitle]);

  return (
    <div ref={ref} data-win-id={win.id} data-win-frame data-render-count={renderCount.current} data-window-chrome="low-profile"
      data-chrome-variant={win.chromeVariant || 'default'} data-header-mode={headerMode}
      data-active={isActive ? 'true' : 'false'} data-tile-group={tiled ? tileGroupId : undefined} data-pinned={win.pinned ? 'true' : 'false'} data-menu-open={menuOpen ? 'true' : 'false'}
      onPointerDownCapture={onAltDown} onPointerDown={onFrameDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onDoubleClick={(e) => { if (inHeader(e)) onUpdate({ maximized: !win.maximized }); }}
      onContextMenu={(e) => { if (!inHeader(e)) return; e.preventDefault(); e.stopPropagation(); setShowColorMenu(true); }}
      onMouseEnter={() => setHoverChrome(true)} onMouseLeave={() => setHoverChrome(false)}
      style={{
        ...frameStyle, ...style,
        ...variantVars,
        background: (frameless && !chromeVisible) || bare ? 'transparent' : customizedBg,
        borderRadius: tiled ? tileRadius(tileCorners) : 'var(--window-radius, var(--radius-window))',
        border: frameless && !chromeVisible
          ? `${theme.borderWidth || 1}px solid ${bare ? 'transparent' : 'var(--hairline)'}`
          : `${theme.borderWidth || 1}px solid ` + frameBorder,
        boxShadow: (frameless && !chromeVisible) || bare ? 'none' : frameShadow,
        backdropFilter: bare ? 'none' : customizedBackdrop,
        WebkitBackdropFilter: bare ? 'none' : customizedBackdrop,
        transition: 'box-shadow var(--dur-base) var(--ease-standard), border-color var(--dur-base) var(--ease-standard), background var(--dur-base) var(--ease-standard), backdrop-filter var(--dur-base) var(--ease-standard)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        '--window-accent': accentBorder,
        '--window-hue': winHue,
        '--accent': accentBorder,
        '--accent-soft': isDark ? `oklch(0.32 0.08 ${winHue})` : `oklch(0.92 0.04 ${winHue})`,
        '--accent-ink': isDark ? `oklch(0.88 0.07 ${winHue})` : `oklch(0.32 0.08 ${winHue})`,
      }}>

      <WindowChromeContext.Provider value={chrome}>
      <RemoteWindowActor actor={win.collaborationActor} />
      <RemoteWindowActor actor={win.typingActor} />

      <span aria-hidden="true" key="header-strip" style={{ position: 'absolute', left: 0, top: 0, right: 0, height: 'var(--window-strip-height, 0px)', background: 'var(--window-strip-bg, transparent)', zIndex: 5, pointerEvents: 'none' }} />
      <WindowHeader key="header" win={win} mode={headerMode} traffic={usesTrafficLights}
        chromeHeader={win.chromeVariant === 'win98' ? 'win98' : 'low-profile'}
        fallback={{ title: headerMeta.title || win.title || 'Window', icon: headerMeta.icon }}
        titleClaimed={titleClaims > 0} slotRefs={{ title: setTitleEl, actions: setActionsEl, menu: setMenuEl }} headerRef={headerRef}
        menuOpen={menuOpen} setMenuOpen={setMenuOpen} onClose={onClose} onUpdate={onUpdate} onOpenStyleMenu={() => setShowColorMenu(true)} />
      {showColorMenu && (
        <WindowStyleMenu win={win} theme={theme} onUpdate={onUpdate} onClose={() => setShowColorMenu(false)} colorMenuRef={colorMenuRef} />
      )}
      {isActive && !win.pinned && (
        <div onPointerDown={startWire} onPointerMove={ownMove} onPointerUp={ownUp} onPointerCancel={ownUp}
          key="wire-handle" title="Drag to connect this window to another"
          style={{
            position: 'absolute', right: -6, top: '50%', marginTop: -6, width: 12, height: 12, borderRadius: 'var(--radius-full)',
            background: accentBorder, border: '2px solid var(--surface)', cursor: 'crosshair', zIndex: 10,
          }}
        />
      )}
      <div key="content-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: win.pinned ? 'hidden' : 'visible', zoom: win.fontScale || 1.0 }}>
        <div style={{
          display: 'flex', flexDirection: 'column',
          flexGrow: win.pinned ? 0 : 1, flexShrink: 0, flexBasis: win.pinned ? 'auto' : '0%', minHeight: 0,
          width: win.pinned ? win.w : '100%', height: win.pinned ? win.h : '100%',
          transform: win.pinned ? 'scale(0.75)' : 'none', transformOrigin: 'top left',
        }}>
          {children}
        </div>
      </div>
      {!win.pinned && !tiled && <WindowResizeHandles key="resize-handles" zoom={zoom} startResize={startResize} onPointerMove={ownMove} onPointerUp={ownUp} />}
      </WindowChromeContext.Provider>
    </div>
  );
});

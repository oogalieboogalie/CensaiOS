/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { useWorkspaceStore } from '../../../lib/store.js';

/** 'dark' or 'light', following the canvas theme as it changes. */
function useDocTheme() {
  const read = () => (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  const [mode, setMode] = React.useState(read);
  React.useEffect(() => {
    const obs = new MutationObserver(() => setMode(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return mode;
}

/**
 * The canvas zooms windows with a CSS scale, and Excalidraw reads the mouse
 * in screen pixels. So the drawing area is drawn at screen size and scaled
 * back by the same amount: the two cancel out, the pen lands exactly under
 * the pointer at any canvas zoom, and lines stay sharp.
 */
function useScreenScale(hostRef) {
  const zoom = useWorkspaceStore((s) => s.zoom);
  const [scale, setScale] = React.useState(1);
  const measure = React.useCallback(() => {
    const el = hostRef.current;
    if (!el || !el.offsetWidth) return;
    const s = el.getBoundingClientRect().width / el.offsetWidth;
    if (s > 0.05 && Math.abs(s - scale) > 0.001) setScale(s);
  }, [hostRef, scale]);
  React.useLayoutEffect(measure, [measure, zoom]);
  React.useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, [hostRef, measure]);
  return { scale, measure };
}

function MenuAndWelcome({ kit }) {
  const { MainMenu, WelcomeScreen } = kit;
  return (
    <>
      <MainMenu>
        <MainMenu.DefaultItems.SearchMenu />
        <MainMenu.DefaultItems.ClearCanvas />
        <MainMenu.DefaultItems.Help />
        <MainMenu.Separator />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
      </MainMenu>
      <WelcomeScreen>
        <WelcomeScreen.Hints.ToolbarHint />
        <WelcomeScreen.Hints.MenuHint />
        <WelcomeScreen.Center>
          <WelcomeScreen.Center.Heading>YorWare Diagrams</WelcomeScreen.Center.Heading>
          <div className="hb-yd-welcome">Pick a shape above and draw. Everyone on this board sees it as you go.</div>
        </WelcomeScreen.Center>
      </WelcomeScreen>
    </>
  );
}

const UI_OPTIONS = {
  canvasActions: {
    loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false, toggleTheme: false,
    changeViewBackgroundColor: true, clearCanvas: true,
  },
};

/** Excalidraw inside a canvas window, synced to the board through `sync`. */
export function DiagramStage({ kit, sync, readOnly }) {
  const hostRef = React.useRef(null);
  const theme = useDocTheme();
  const { scale, measure } = useScreenScale(hostRef);
  const { Excalidraw } = kit;
  const { api } = sync;

  // The window can be dragged or the canvas panned without any scroll event,
  // so Excalidraw re-reads where it sits before each touch.
  const refresh = () => { measure(); api?.refresh(); };

  React.useEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;
    // Wheel scrolls and zooms the drawing, not the board behind it.
    const stop = (e) => e.stopPropagation();
    el.addEventListener('wheel', stop);
    return () => el.removeEventListener('wheel', stop);
  }, []);
  React.useEffect(() => { api?.refresh(); }, [api, scale]);

  return (
    <div className="hb-yd-stage" ref={hostRef} data-no-drag onPointerEnter={refresh} onPointerDownCapture={refresh}>
      <div className="hb-yd-fit" style={scale === 1 ? undefined : { width: `${scale * 100}%`, height: `${scale * 100}%`, transform: `scale(${1 / scale})` }}>
        <Excalidraw
          excalidrawAPI={sync.setApi}
          initialData={sync.initialData}
          onChange={sync.onChange}
          theme={theme}
          viewModeEnabled={readOnly}
          UIOptions={UI_OPTIONS}
          detectScroll
          handleKeyboardGlobally={false}
          aiEnabled={false}
        >
          <MenuAndWelcome kit={kit} />
        </Excalidraw>
      </div>
    </div>
  );
}

import React from 'react';
import { MIN_ZOOM, MAX_ZOOM, getPanAfterZoom } from '../../lib/canvasMath.js';
import { hasCanvasUiAncestor } from './CanvasInteractions.js';

export function useCanvasViewport({ ref, pan, zoom, onPanZoom, panMode = 'both' }) {
  const [spaceHeld, setSpaceHeld] = React.useState(false);
  const spaceRef = React.useRef(false);

  React.useEffect(() => {
    const panCode = panMode === 'alt' ? 'Alt' : 'Space';
    const keyboardEnabled = panMode !== 'middle';
    const down = (e) => {
      const matches = panCode === 'Alt' ? e.key === 'Alt' : e.code === 'Space';
      // Never steal Space from an editing surface: inputs, textareas (legacy
      // code pane), and contenteditable elements (CodeMirror 6 panes, etc.).
      const typing = ['INPUT', 'TEXTAREA'].includes(e.target.tagName)
        || e.target.isContentEditable
        || (e.target.closest && e.target.closest('[contenteditable="true"]'));
      if (keyboardEnabled && matches && !e.repeat && !typing) {
        e.preventDefault();
        spaceRef.current = true;
        setSpaceHeld(true);
      }
    };
    const up = (e) => {
      // Clear on Space *or* Alt release regardless of the current panMode so
      // switching the pan control mid-hold can never leave spaceRef stuck true
      // (stuck Space turns every left-drag into a pan and hijacks button
      // clicks via the pan-capture path in useCanvasPointer).
      const matches = panCode === 'Alt' ? e.key === 'Alt' : e.code === 'Space';
      const eitherModifierReleased = e.code === 'Space' || e.key === 'Alt';
      if (matches || eitherModifierReleased) {
        spaceRef.current = false;
        setSpaceHeld(false);
      }
    };
    // Losing window focus (Alt-Tab, DevTools click, iframe focus steal) skips
    // keyup entirely — reset or Space stays held forever.
    const clear = () => {
      spaceRef.current = false;
      setSpaceHeld(false);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') clear();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [panMode]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e) => {
      if (hasCanvasUiAncestor(e.target, el)) return;

      let node = e.target;
      while (node && node !== el) {
        if (node.dataset?.winId || (node.getAttribute && node.getAttribute('data-win-id'))) return;
        node = node.parentNode;
      }

      e.preventDefault();
      const rect = el.getBoundingClientRect();

      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY * 0.003;
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (1 + delta)));
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        onPanZoom({
          ...getPanAfterZoom(pan.x, pan.y, cx, cy, zoom, newZoom),
          zoom: newZoom,
        });
      } else {
        onPanZoom({
          panX: pan.x - e.deltaX,
          panY: pan.y - e.deltaY,
          zoom,
        });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [pan.x, pan.y, zoom, onPanZoom, ref]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const resetScroll = () => {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    };
    el.addEventListener('scroll', resetScroll);
    return () => el.removeEventListener('scroll', resetScroll);
  }, [ref]);

  return { spaceHeld, spaceRef };
}

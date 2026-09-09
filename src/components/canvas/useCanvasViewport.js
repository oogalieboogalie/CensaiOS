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
      const matches = panCode === 'Alt' ? e.key === 'Alt' : e.code === 'Space';
      if (matches) {
        spaceRef.current = false;
        setSpaceHeld(false);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
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

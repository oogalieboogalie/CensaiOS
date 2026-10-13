/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { createPortal } from 'react-dom';
import { SlideView } from './SlideView.jsx';
import { THEMES } from '../../../lib/office/slideModel.js';

function useViewport() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [size, setSize] = React.useState(read);
  React.useEffect(() => {
    const on = () => setSize(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return size;
}

/**
 * Full-screen presenting over the whole app. Arrows, Space, Page keys or a
 * click move between slides; Escape (or the browser leaving full screen)
 * ends it.
 */
export function PresentMode({ deck, startId, onExit }) {
  const [index, setIndex] = React.useState(Math.max(0, deck.order.indexOf(startId)));
  const rootRef = React.useRef(null);
  const { w, h } = useViewport();
  const width = Math.min(w, (h * 16) / 9);
  const total = deck.order.length;
  const go = (delta) => setIndex((i) => Math.max(0, Math.min(total - 1, i + delta)));

  React.useEffect(() => {
    rootRef.current?.focus();
    rootRef.current?.requestFullscreen?.().catch?.(() => {});
    const onFs = () => { if (!document.fullscreenElement) onExit(); };
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) document.exitFullscreen?.().catch?.(() => {});
    };
  }, []);

  const onKeyDown = (e) => {
    e.stopPropagation();
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); go(1); }
    if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); go(-1); }
    if (e.key === 'Home') setIndex(0);
    if (e.key === 'End') setIndex(total - 1);
    if (e.key === 'Escape') { e.preventDefault(); onExit(); }
  };
  const id = deck.order[index];
  const t = THEMES[deck.theme] || THEMES.censai;

  return createPortal(
    <div className="hb-of-present" ref={rootRef} tabIndex={-1} role="dialog" aria-label="Presenting" aria-modal="true"
      style={{ background: `#${t.bg}` }} onKeyDown={onKeyDown} onClick={() => go(1)}>
      <SlideView slide={deck.slides[id]} theme={deck.theme} width={width} label={`Slide ${index + 1} of ${total}`} />
      <div className="hb-of-present-hud" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous slide">Prev</button>
        <span>{index + 1} / {total}</span>
        <button type="button" onClick={() => go(1)} disabled={index >= total - 1} aria-label="Next slide">Next</button>
        <button type="button" onClick={onExit}>Exit (Esc)</button>
      </div>
    </div>,
    document.body,
  );
}

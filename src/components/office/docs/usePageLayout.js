// Page view for YorWare Writer: measures each row as laid out, works out
// where the sheets break (planPageBreaks), and scales the sheet down when
// the window is narrower than a real page. Nothing here is saved: every
// person sees their own breaks for the same shared document.
import React from 'react';
import { pageBox, planPageBreaks } from '../../../lib/office/docPages.js';

const EMPTY = { breaks: {}, pages: 1, tail: 0, height: 0 };
const SIDE_ROOM = 32;

export function usePageLayout(size) {
  const articleRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const [layout, setLayout] = React.useState(EMPTY);
  const [scale, setScale] = React.useState(1);
  const [tick, setTick] = React.useState(0);
  const box = React.useMemo(() => (size ? pageBox(size) : null), [size]);

  React.useLayoutEffect(() => {
    const article = articleRef.current;
    if (!box || !article) { setLayout((l) => (l === EMPTY ? l : EMPTY)); return; }
    const items = [];
    let drawn = 0; // height of break bands and the tail already on screen
    for (const el of article.children) {
      if (el.dataset.pageChrome) { drawn += el.offsetHeight; continue; }
      if (!el.dataset.rowId) continue;
      items.push({ id: el.dataset.rowId, top: el.offsetTop - box.margin - drawn, height: el.offsetHeight, keepWithNext: el.dataset.keep === 'true' });
    }
    const plan = planPageBreaks(items, box.contentHeight);
    const next = { ...plan, height: article.offsetHeight };
    setLayout((l) => (JSON.stringify(l) === JSON.stringify(next) ? l : next));
  });

  React.useEffect(() => {
    if (!box || typeof ResizeObserver === 'undefined') return undefined;
    const fit = () => {
      const room = scrollRef.current?.clientWidth || box.width;
      setScale(Math.min(1, Math.max(0.3, (room - SIDE_ROOM) / box.width)));
    };
    fit();
    const ro = new ResizeObserver(() => { fit(); setTick((t) => t + 1); });
    if (scrollRef.current) ro.observe(scrollRef.current);
    if (articleRef.current) ro.observe(articleRef.current);
    return () => ro.disconnect();
  }, [box]);

  return { articleRef, scrollRef, box, scale, tick, ...layout };
}

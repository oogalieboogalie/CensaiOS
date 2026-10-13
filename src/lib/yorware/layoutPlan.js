// What to draw on each page of a YorWare Layout document, worked out once and
// used by both the screen and the PDF export, so the two always match.
import { MASTER } from './layoutModel.js';
import { flowStory } from './layoutFlow.js';

/**
 * Flow every story that lives on real pages. Master-page stories are flowed
 * per page (they can carry {page} and {pages}), by `pageItems`.
 * Returns { [frameId]: { lines, overflow, hiddenWords, index, count } }.
 */
export function flowDocument(doc) {
  const out = {};
  for (const [sid, chain] of Object.entries(doc.chains)) {
    const frames = chain.map((id) => ({ id, frame: doc.frames[id] })).filter((x) => x.frame.page !== MASTER);
    if (!frames.length) continue;
    const r = flowStory(doc.stories[sid], frames);
    frames.forEach(({ id }, i) => {
      const last = i === frames.length - 1;
      out[id] = { lines: r.frames[id], overflow: last && r.overflow, hiddenWords: last ? r.hiddenWords : 0, index: i, count: frames.length };
    });
  }
  return out;
}

/**
 * The frames to draw on one page, back to front: the master items first
 * (unless the page hides them), then the page's own. Text frames carry their
 * lines. `flow` is flowDocument(doc).
 */
export function pageItems(doc, pageId, flow) {
  const pageNo = doc.order.indexOf(pageId) + 1;
  const showMaster = pageId === MASTER || !doc.pages[pageId]?.noMaster;
  const items = [];
  if (showMaster) {
    for (const id of doc.byPage[MASTER] || []) {
      const frame = doc.frames[id];
      let text = null;
      if (frame.type === 'text') {
        const no = pageId === MASTER ? '#' : pageNo;
        const r = flowStory(doc.stories[frame.story], [{ id, frame }], { pageNo: no, pages: pageId === MASTER ? '#' : doc.order.length });
        text = { lines: r.frames[id], overflow: r.overflow, hiddenWords: r.hiddenWords, index: 0, count: 1 };
      }
      items.push({ id, frame, master: pageId !== MASTER, text });
    }
  }
  if (pageId !== MASTER) {
    for (const id of doc.byPage[pageId] || []) {
      const frame = doc.frames[id];
      items.push({ id, frame, master: false, text: frame.type === 'text' ? flow[id] || { lines: [], overflow: false, index: 0, count: 1 } : null });
    }
  }
  return items;
}

/**
 * Where a picture lands inside its frame: `fill` covers the frame (cropping
 * the overflow), `fit` shows the whole picture. Returns the drawn box.
 */
export function imageBox(frame, img) {
  const iw = Number(img?.w) || 1;
  const ih = Number(img?.h) || 1;
  const s = (frame.fit === 'fit' ? Math.min : Math.max)(frame.w / iw, frame.h / ih);
  const w = iw * s;
  const h = ih * s;
  return { x: frame.x + (frame.w - w) / 2, y: frame.y + (frame.h - h) / 2, w, h };
}

/** A line frame's two ends. `dir` -1 runs from bottom-left to top-right. */
export function lineEnds(frame) {
  return frame.dir === -1
    ? { x1: frame.x, y1: frame.y + frame.h, x2: frame.x + frame.w, y2: frame.y }
    : { x1: frame.x, y1: frame.y, x2: frame.x + frame.w, y2: frame.y + frame.h };
}

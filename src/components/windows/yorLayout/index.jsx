/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { OfficeBar, OfficeButton, OfficeSep } from '../../office/OfficeBar.jsx';
import { ToolIcon } from '../../creative/toolIcons.jsx';
import { typingIn } from '../../creative/useUndo.js';
import { useFitScale } from '../../creative/useFitScale.js';
import { LayoutIcon } from '../../yorware/layoutIcons.jsx';
import { useLayout, UNTITLED } from '../../yorware/layout/useLayout.js';
import { LayoutPage } from '../../yorware/layout/LayoutPage.jsx';
import { LayoutPageStrip } from '../../yorware/layout/LayoutPageStrip.jsx';
import { LayoutPanel } from '../../yorware/layout/LayoutPanel.jsx';
import { LayoutStart } from '../../yorware/layout/LayoutStart.jsx';
import { MASTER } from '../../../lib/yorware/layoutModel.js';
import { buildLayoutPdf } from '../../../lib/yorware/layoutExport.js';
import { pickPicture } from '../../../lib/yorware/layoutPictures.js';

const TOOLS = [
  ['select', 'Select and move', 'V', ToolIcon.Pointer],
  ['text', 'Text frame', 'T', ToolIcon.Text],
  ['image', 'Picture frame', 'P', LayoutIcon.Picture],
  ['rect', 'Rectangle', 'R', ToolIcon.Rect],
  ['ellipse', 'Ellipse', 'E', ToolIcon.Ellipse],
  ['line', 'Line', 'L', ToolIcon.Line],
];
const TIPS = {
  text: 'Drag out a text frame, then type in the panel on the right.',
  image: 'Drag out a picture frame, then double-click it or drop a picture on it.',
  rect: 'Drag to draw a rectangle. Hold Shift while resizing to keep its shape.',
  ellipse: 'Drag to draw an ellipse.',
  line: 'Drag to draw a line.',
  link: 'Click the text frame this story should flow into next. Escape cancels.',
};
const ZOOMS = [['fit', 'Fit page'], ['0.75', '75%'], ['1', '100%'], ['1.5', '150%']];

// YorWare Layout: flyers, menus, listing sheets and newsletters. Pages with
// text, picture and shape frames; text flows from frame to frame and page to
// page; a master page for what repeats; a print-ready PDF out. Part of the
// YorWare Suite (docs/specs/13-yorware-suite.md).
export function YorLayoutWindow({ win = {}, onUpdate }) {
  const p = useLayout(win, onUpdate);
  const { doc, history, pageId, pageIndex, tool } = p;
  const wrapRef = React.useRef(null);
  const textRef = React.useRef(null);
  const [zoom, setZoom] = React.useState('fit');
  const fit = useFitScale(wrapRef, doc.w, doc.h, 48);
  const scale = zoom === 'fit' ? fit : Number(zoom);
  const title = win.title || UNTITLED;
  const count = doc.order.length;

  const editText = () => setTimeout(() => textRef.current?.focus(), 0);
  const pickInto = async (frameId) => { const file = await pickPicture(); if (file) p.addPicture(file, { frameId }); };
  const formats = [
    { ext: 'pdf', label: 'Print-ready PDF', hint: 'Every page at its exact size, text as real text, full-size pictures', build: () => buildLayoutPdf(win) },
    { ext: 'png', label: 'This page as a picture', hint: 'For posting online', build: async () => {
      if (!pageId || pageId === MASTER) throw new Error('Go to a page first.');
      const bytes = await buildLayoutPdf(win, undefined, { pageIds: [pageId] });
      return (await import('../../../lib/yorware/pdfRender.js')).firstPageToPng(bytes, 300 / 72);
    } },
  ];

  const onKeyDown = (e) => {
    if (typingIn(e)) return;
    if (history.onKey(e)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); p.duplicate(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); p.select(doc.byPage[pageId] || []); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && p.selected.length) { e.preventDefault(); p.remove(); return; }
    if (e.key === 'Escape') { p.select([]); p.setLinkFrom(null); p.setTool('select'); return; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key] && p.selected.length) { e.preventDefault(); const n = e.shiftKey ? 9 : 1; p.nudge(arrows[e.key][0] * n, arrows[e.key][1] * n); return; }
    if (e.key === 'PageDown') { e.preventDefault(); p.step(1); return; }
    if (e.key === 'PageUp') { e.preventDefault(); p.step(-1); return; }
    const t = TOOLS.find((x) => x[2].toLowerCase() === e.key.toLowerCase());
    if (t && pageId) p.setTool(t[0]);
  };

  return (
    <>
      <WindowTitle icon={<LayoutIcon.Doc size={12} />} label={title} subtitle={count ? `YorWare Layout · ${count} page${count === 1 ? '' : 's'}` : 'YorWare Layout'} />
      <div className="hb-of hb-cr hb-yl" data-app="layout" tabIndex={-1} onKeyDown={onKeyDown}>
        <OfficeBar title={title} formats={formats} importHint="Put a picture from your computer on this page"
          onImport={pageId ? async () => { const file = await pickPicture(); if (file) await p.addPicture(file); } : undefined}>
          <OfficeButton label="Undo" title="Undo (Ctrl+Z)" icon={<ToolIcon.Undo />} disabled={!history.canUndo} onClick={history.undo} />
          <OfficeButton label="Redo" title="Redo (Ctrl+Shift+Z)" icon={<ToolIcon.Redo />} disabled={!history.canRedo} onClick={history.redo} />
          <OfficeSep />
          <OfficeButton label="Previous page" title="Previous page (Page Up)" icon={<LayoutIcon.Prev />} disabled={pageIndex <= 0} onClick={() => p.step(-1)} />
          <span className="hb-cr-num hb-yl-count" aria-live="polite">{pageId === MASTER ? 'Master' : count ? `${pageIndex + 1} / ${count}` : '0 / 0'}</span>
          <OfficeButton label="Next page" title="Next page (Page Down)" icon={<LayoutIcon.Next />} disabled={pageIndex < 0 || pageIndex >= count - 1} onClick={() => p.step(1)} />
          <OfficeSep />
          <OfficeButton label="Add page" title="Add a page after this one" icon={<LayoutIcon.AddPage />} disabled={!count} onClick={p.addPage} />
          <OfficeButton label="Move page earlier" icon={<LayoutIcon.Up />} disabled={pageIndex <= 0} onClick={() => p.movePage(pageIndex - 1)} />
          <OfficeButton label="Move page later" icon={<LayoutIcon.Down />} disabled={pageIndex < 0 || pageIndex >= count - 1} onClick={() => p.movePage(pageIndex + 1)} />
          <OfficeButton label="Delete page" title="Remove this page and what's on it" icon={<LayoutIcon.Trash />} disabled={pageIndex < 0} onClick={p.removePage} />
          <OfficeSep />
          <select className="hb-of-select" aria-label="Zoom" value={zoom} onChange={(e) => setZoom(e.target.value)}>
            {ZOOMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </OfficeBar>
        {p.notice && <div role="status" className="hb-of-alert"><span>{p.notice}</span><button type="button" className="hb-of-btn" aria-label="Dismiss" onClick={() => p.setNotice(null)}><Icon.Close size={10} /></button></div>}
        <div className="hb-cr-body">
          {count > 0 && (
            <div className="hb-cr-toolrail" role="toolbar" aria-label="Tools" aria-orientation="vertical">
              {TOOLS.map(([id, label, key, Glyph]) => (
                <OfficeButton key={id} label={label} title={`${label} (${key})`} icon={<Glyph />} pressed={tool === id} onClick={() => p.setTool(id)} />
              ))}
            </div>
          )}
          {count > 0 && <LayoutPageStrip p={p} />}
          <div className="hb-cr-stage hb-yl-stage" ref={wrapRef} data-busy={p.busy ? 'true' : undefined}>
            {count > 0
              ? <LayoutPage p={p} scale={scale} onEditText={editText} onPickPicture={pickInto} />
              : <LayoutStart onPick={p.applyTemplate} />}
          </div>
          {count > 0 && <LayoutPanel p={p} textRef={textRef} onPickPicture={pickInto} />}
        </div>
        {TIPS[tool] && count > 0 && <div className="hb-cr-tip" role="status">{TIPS[tool]}</div>}
      </div>
    </>
  );
}

export default YorLayoutWindow;

/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { OfficeBar, OfficeButton, OfficeSep } from '../../office/OfficeBar.jsx';
import { ToolIcon } from '../../creative/toolIcons.jsx';
import { typingIn } from '../../creative/useUndo.js';
import { useFitScale } from '../../creative/useFitScale.js';
import { PdfIcon } from '../../yorware/pdfIcons.jsx';
import { usePdf, UNTITLED } from '../../yorware/pdf/usePdf.js';
import { PdfPageView } from '../../yorware/pdf/PdfPageView.jsx';
import { PdfPageStrip } from '../../yorware/pdf/PdfPageStrip.jsx';
import { SignaturePad } from '../../yorware/pdf/SignaturePad.jsx';
import { PdfSearchBar } from '../../yorware/pdf/PdfSearchBar.jsx';
import { usePdfSearch, findsOnPage } from '../../yorware/pdf/usePdfSearch.js';
import { usePdfForm } from '../../yorware/pdf/usePdfForm.js';
import { buildPdf } from '../../../lib/yorware/pdfExport.js';

const flatten = async (bytes, indexes) => (await import('../../../lib/yorware/pdfRender.js')).pagesToPng(bytes, indexes);
const finished = (win) => buildPdf(win, undefined, { flatten });

const TOOLS = [
  ['select', 'Select and move', 'V', ToolIcon.Pointer],
  ['text', 'Type text', 'T', ToolIcon.Text],
  ['sign', 'Sign', 'S', PdfIcon.Sign],
  ['highlight', 'Highlight', 'H', PdfIcon.Highlight],
  ['redact', 'Black out', 'B', PdfIcon.Redact],
];
const TIPS = {
  text: 'Click where the text should go, then type.',
  sign: 'Click where your signature should go.',
  highlight: 'Drag across what you want to highlight.',
  redact: 'Drag across what you want to black out. In the saved PDF that page becomes a picture, so the hidden words are really gone.',
};
const flagTip = (flags) => {
  const who = [...new Set(flags.map((f) => f.signer).filter(Boolean))].join(' and ');
  return `${who || 'Someone'} ${who.includes(' and ') ? 'are' : 'is'} asked to sign this page. Click Sign on the amber flag to put your signature there; the flag never prints.`;
};
const ZOOMS = [['fit', 'Fit page'], ['1', '100%'], ['1.5', '150%'], ['2', '200%']];

function pickPdfs() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.multiple = true;
    input.addEventListener('change', () => resolve(Array.from(input.files || [])), { once: true });
    input.click();
  });
}
const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');

// YorWare PDF: open PDFs on the board, reorder, rotate and merge pages, type,
// sign, highlight and black out, fill the PDF's own form, find words, then
// export a finished PDF. Agents read it, fill it and flag where to sign
// (read_pdf, fill_pdf_field, sign_here). Part of the
// YorWare Suite (docs/specs/13-yorware-suite.md).
export function YorPdfWindow({ win = {}, onUpdate }) {
  const p = usePdf(win, onUpdate);
  const byFile = usePdfForm(p.doc);
  const search = usePdfSearch(p.doc, p.goTo);
  const { doc, history, page, pageId, pageIndex, size, tool, selected } = p;
  const wrapRef = React.useRef(null);
  const [zoom, setZoom] = React.useState('fit');
  const [dropping, setDropping] = React.useState(false);
  const fit = useFitScale(wrapRef, size.w, size.h, 40);
  const scale = zoom === 'fit' ? fit : Number(zoom);
  const title = win.title || UNTITLED;
  const flags = (doc.marksByPage[pageId] || []).map((id) => doc.marks[id]).filter((m) => m.type === 'signHere');
  const count = doc.order.length;

  const formats = [
    { ext: 'pdf', label: 'PDF with your changes', hint: 'Every page in this order, with text, signatures and marks', build: () => finished(win) },
    { ext: 'png', label: 'This page as a picture', hint: 'The page you are on, with its marks', build: async () => {
      if (!pageId) throw new Error('Open a PDF first.');
      const bytes = await finished({ ...win, pdfDoc: { order: [pageId] } });
      return (await import('../../../lib/yorware/pdfRender.js')).firstPageToPng(bytes);
    } },
  ];

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); e.stopPropagation(); search.setOpen(true); return; }
    if (typingIn(e) || p.padOpen) return;
    if (history.onKey(e)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const m = p.mark;
    if ((e.key === 'Delete' || e.key === 'Backspace') && m) { e.preventDefault(); p.removeMark(); return; }
    if (e.key === 'Escape') { p.setSelected(null); p.setTool('select'); return; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key] && m) {
      e.preventDefault();
      const n = e.shiftKey ? 10 : 1;
      p.changeMark(selected, { x: m.x + arrows[e.key][0] * n, y: m.y + arrows[e.key][1] * n });
      return;
    }
    if (e.key === 'PageDown' || (e.key === 'ArrowRight' && !m)) { e.preventDefault(); p.step(1); return; }
    if (e.key === 'PageUp' || (e.key === 'ArrowLeft' && !m)) { e.preventDefault(); p.step(-1); return; }
    const t = TOOLS.find((x) => x[2].toLowerCase() === e.key.toLowerCase());
    if (t) { if (t[0] === 'sign' && !p.signature) p.setPadOpen(true); else p.setTool(t[0]); }
  };
  const chooseTool = (id) => {
    if (id === 'sign' && !p.signature) { p.setPadOpen(true); return; }
    p.setTool(id);
  };

  return (
    <>
      <WindowTitle icon={<PdfIcon.Doc size={12} />} label={title} subtitle={count ? `YorWare PDF · ${count} page${count === 1 ? '' : 's'}` : 'YorWare PDF'} />
      <div className="hb-of hb-cr hb-yp" data-app="pdf" data-dropping={dropping ? 'true' : undefined} tabIndex={-1} onKeyDown={onKeyDown}
        onDragOver={(e) => { if (hasFiles(e)) { e.preventDefault(); setDropping(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropping(false); }}
        onDrop={(e) => { if (!hasFiles(e)) return; e.preventDefault(); setDropping(false); p.addFiles(e.dataTransfer.files); }}>
        <OfficeBar title={title} formats={formats} importHint="Add a PDF; its pages go at the end"
          onImport={async () => p.addFiles(await pickPdfs())}>
          <OfficeButton label="Undo" title="Undo (Ctrl+Z)" icon={<ToolIcon.Undo />} disabled={!history.canUndo} onClick={history.undo} />
          <OfficeButton label="Redo" title="Redo (Ctrl+Shift+Z)" icon={<ToolIcon.Redo />} disabled={!history.canRedo} onClick={history.redo} />
          <OfficeSep />
          <OfficeButton label="Previous page" title="Previous page (Page Up)" icon={<PdfIcon.Prev />} disabled={pageIndex <= 0} onClick={() => p.step(-1)} />
          <span className="hb-cr-num hb-yp-count" aria-live="polite">{count ? `${pageIndex + 1} / ${count}` : '0 / 0'}</span>
          <OfficeButton label="Next page" title="Next page (Page Down)" icon={<PdfIcon.Next />} disabled={pageIndex < 0 || pageIndex >= count - 1} onClick={() => p.step(1)} />
          <OfficeSep />
          <OfficeButton label="Rotate page" title="Turn this page a quarter turn" icon={<PdfIcon.Rotate />} disabled={!page} onClick={() => p.rotatePage()} />
          <OfficeButton label="Move page up" title="Move this page earlier" icon={<PdfIcon.Up />} disabled={pageIndex <= 0} onClick={() => p.movePage(pageId, pageIndex - 1)} />
          <OfficeButton label="Move page down" title="Move this page later" icon={<PdfIcon.Down />} disabled={pageIndex < 0 || pageIndex >= count - 1} onClick={() => p.movePage(pageId, pageIndex + 1)} />
          <OfficeButton label="Delete page" title="Remove this page" icon={<PdfIcon.Trash />} disabled={!page} onClick={() => p.removePage()} />
          <OfficeSep />
          <OfficeButton label="Find" title="Find words in this PDF (Ctrl+F)" icon={<PdfIcon.Find />} pressed={search.open} disabled={!count} onClick={() => (search.open ? search.close() : search.setOpen(true))} />
          <OfficeButton wide label="Remove mark" title="Remove what you selected (Delete)" icon={<Icon.Close size={10} />} disabled={!p.mark} onClick={() => p.removeMark()} />
          <select className="hb-of-select" aria-label="Zoom" value={zoom} onChange={(e) => setZoom(e.target.value)}>
            {ZOOMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </OfficeBar>
        {search.open && count > 0 && <PdfSearchBar s={search} />}
        {p.notice && <div role="status" className="hb-of-alert"><span>{p.notice}</span><button type="button" className="hb-of-btn" aria-label="Dismiss" onClick={() => p.setNotice(null)}><Icon.Close size={10} /></button></div>}
        <div className="hb-cr-body">
          <div className="hb-cr-toolrail" role="toolbar" aria-label="Tools" aria-orientation="vertical">
            {TOOLS.map(([id, label, key, Glyph]) => (
              <OfficeButton key={id} label={label} title={`${label} (${key})`} icon={<Glyph />} pressed={tool === id} disabled={!page} onClick={() => chooseTool(id)} />
            ))}
            {p.signature && <OfficeButton label="Draw a new signature" title="Draw a new signature" icon={<ToolIcon.Pen />} onClick={() => p.setPadOpen(true)} />}
          </div>
          {count > 0 && <PdfPageStrip p={p} />}
          <div className="hb-cr-stage hb-yp-stage" ref={wrapRef}>
            {page ? <PdfPageView p={p} scale={scale} byFile={byFile} finds={findsOnPage(search, pageId)} /> : (
              <div className="hb-yp-empty">
                <PdfIcon.Doc size={28} />
                <div className="hb-yp-empty-title">{p.busy ? 'Opening…' : 'Drop a PDF here'}</div>
                <p className="hb-cr-hint">Read it, reorder and turn pages, merge more PDFs in, type, sign, highlight or black out, then export. It's saved on the board, so everyone here sees the same document.</p>
                <button type="button" className="hb-of-btn" data-wide="true" data-primary="true" disabled={p.busy} onClick={async () => p.addFiles(await pickPdfs())}>
                  <PdfIcon.Open /><span>Open a PDF</span>
                </button>
              </div>
            )}
          </div>
        </div>
        {TIPS[tool] && page && <div className="hb-cr-tip" role="status">{TIPS[tool]}</div>}
        {!TIPS[tool] && flags.length > 0 && <div className="hb-cr-tip" role="status">{flagTip(flags)}</div>}
        {p.padOpen && <SignaturePad onSave={p.saveSignature} onCancel={p.cancelPad} />}
      </div>
    </>
  );
}

export default YorPdfWindow;

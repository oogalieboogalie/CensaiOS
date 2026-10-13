// State and actions for one YorWare PDF window. Pages and marks sync one by
// one through the board; the tool, the page you're on and the selection stay
// local to you.
import React from 'react';
import {
  MAX_PDF_BYTES, addFilePatch, addMarkPatch, clampBox, markPatch, movePagePatch, readPdf,
  removeMarkPatch, removePagesPatch, rotatePagePatch, shownSize, textBox,
} from '../../../lib/yorware/pdfModel.js';
import { bytesToBase64, looksLikePdf } from '../../../lib/yorware/pdfBytes.js';
import { readPageInfo } from '../../../lib/yorware/pdfExport.js';
import { valuePatch } from '../../../lib/yorware/pdfForm.js';
import { useUndo } from '../../creative/useUndo.js';

export const UNTITLED = 'Untitled PDF';
const SIGNATURE_KEY = 'homebase.yorware.signature.v1';

function loadSignature() {
  try { return JSON.parse(window.localStorage.getItem(SIGNATURE_KEY) || 'null'); } catch { return null; }
}
function storeSignature(sig) {
  try { window.localStorage.setItem(SIGNATURE_KEY, JSON.stringify(sig)); } catch { /* private window: keep it for this session */ }
}

export function usePdf(win, onUpdate) {
  const doc = React.useMemo(() => readPdf(win), [win]);
  const history = useUndo(win, onUpdate);
  const { update } = history;
  const [current, setCurrent] = React.useState(null);
  const [tool, setTool] = React.useState('select');
  const [selected, setSelected] = React.useState(null);
  const [editId, setEditId] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [signature, setSignatureRaw] = React.useState(loadSignature);
  const [padOpen, setPadOpen] = React.useState(false);
  // Where a signature goes once it is drawn (a sign-here flag or signature box).
  const [pendingSign, setPendingSign] = React.useState(null);

  const pageId = doc.pages[current] ? current : doc.order[0] || null;
  const page = pageId ? doc.pages[pageId] : null;
  const pageIndex = pageId ? doc.order.indexOf(pageId) : -1;
  const mark = selected && doc.marks[selected] ? doc.marks[selected] : null;

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    setBusy(true);
    setNotice(null);
    let working = doc;
    let firstNew = null;
    let patchTitle = null;
    try {
      for (const file of files) {
        if (file.size > MAX_PDF_BYTES) throw new Error(`"${file.name}" is ${(file.size / 1048576).toFixed(1)} MB. PDFs up to ${MAX_PDF_BYTES / 1048576} MB fit on the board.`);
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!looksLikePdf(bytes)) throw new Error(`"${file.name}" is not a PDF.`);
        let pages;
        try { pages = await readPageInfo(bytes); } catch { throw new Error(`"${file.name}" could not be read. It may be damaged or locked with a password.`); }
        if (!pages.length) throw new Error(`"${file.name}" has no pages.`);
        const { pageIds, patch } = addFilePatch(working, { name: file.name, data: bytesToBase64(bytes), bytes: bytes.length, pages });
        if (!working.order.length && (!win.title || win.title === UNTITLED)) patchTitle = file.name.replace(/\.pdf$/i, '');
        update(patchTitle ? { ...patch, title: patchTitle } : patch);
        patchTitle = null;
        working = { ...working, order: patch.pdfDoc.order };
        firstNew ||= pageIds[0];
      }
      if (firstNew) setCurrent(firstNew);
    } catch (err) {
      setNotice(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const goTo = (id) => { setCurrent(id); setSelected(null); setEditId(null); };
  const step = (delta) => {
    const next = doc.order[pageIndex + delta];
    if (next) goTo(next);
  };
  const movePage = (id, toIndex) => update(movePagePatch(doc, id, toIndex));
  const rotatePage = (id = pageId) => { if (id) update(rotatePagePatch(doc, id)); };
  const removePage = (id = pageId) => {
    if (!id) return;
    const i = doc.order.indexOf(id);
    update(removePagesPatch(doc, [id]));
    setCurrent(doc.order[i + 1] || doc.order[i - 1] || null);
    setSelected(null);
  };

  const size = page ? shownSize(page) : { w: 612, h: 792 };
  const addMark = (fields) => {
    if (!pageId) return null;
    const box = clampBox(fields, size);
    const { id, patch } = addMarkPatch({ ...fields, ...box, page: pageId });
    update(patch);
    setSelected(id);
    setTool('select');
    return id;
  };
  const addText = (x, y) => {
    const sizePt = 14;
    const text = 'Type here';
    const id = addMark({ type: 'text', text, size: sizePt, x, y: y - sizePt / 2, ...textBox(text, sizePt) });
    if (id) setEditId(id);
  };
  const addSignature = (x, y, sig = signature) => {
    if (!sig) { setPadOpen(true); return; }
    const w = Math.min(180, size.w * 0.4);
    const h = w / (sig.ratio || 3);
    addMark({ type: 'sign', strokes: sig.strokes, x: x - w / 2, y: y - h / 2, w, h });
  };
  const changeMark = (id, fields, opts) => {
    const m = doc.marks[id];
    if (!m) return;
    let next = { ...m, ...fields };
    if (m.type === 'text' && ('text' in fields || 'size' in fields)) next = { ...next, ...textBox(next.text, next.size) };
    update(markPatch(id, { ...next, ...clampBox(next, size) }), opts);
  };
  const removeMark = (id = selected) => {
    if (!id || !doc.marks[id]) return;
    update(removeMarkPatch(id));
    setSelected(null);
    setEditId(null);
  };
  // Your signature, fitted inside a box; a sign-here flag there is used up.
  const placeSignIn = (box, flagId, sig) => {
    const ratio = sig.ratio || 3;
    let w = box.w;
    let h = w / ratio;
    if (h > box.h) { h = box.h; w = h * ratio; }
    const { id, patch } = addMarkPatch({ type: 'sign', strokes: sig.strokes, page: pageId, ...clampBox({ x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }, size) });
    update(flagId ? { ...patch, ...removeMarkPatch(flagId) } : patch);
    setSelected(id);
  };
  const signInto = (box, flagId = null) => {
    if (!pageId) return;
    if (!signature) { setPendingSign({ box, flagId }); setPadOpen(true); return; }
    placeSignIn(box, flagId, signature);
  };
  const fillField = (fileId, field, value) => update(valuePatch(fileId, field, value));
  const saveSignature = (sig) => {
    setSignatureRaw(sig);
    storeSignature(sig);
    setPadOpen(false);
    if (pendingSign) { placeSignIn(pendingSign.box, pendingSign.flagId, sig); setPendingSign(null); } else setTool('sign');
  };
  const cancelPad = () => { setPadOpen(false); setPendingSign(null); };

  return {
    doc, history, update, page, pageId, pageIndex, size, mark, tool, setTool, selected, setSelected, editId, setEditId,
    notice, setNotice, busy, signature, saveSignature, padOpen, setPadOpen, cancelPad, signInto, fillField,
    addFiles, goTo, step, movePage, rotatePage, removePage, addMark, addText, addSignature, changeMark, removeMark,
  };
}

// How a YorWare PDF window lives in board state. Like Censai Office, each
// piece is its own window field so two people working on one PDF merge
// instead of overwriting each other. A removed piece is set to null
// (undefined is skipped by the sync).
//
//   pdfDoc        { order: [pageId…] }                 page order
//   pf.<fileId>   { name, data, pages, bytes, at }      an added PDF (base64)
//   pp.<pageId>   { file, index, w, h, srcRot, rot, at } one page of a file
//   pm.<markId>   { page, type, x, y, w, h, … , at }     something added on a page
//   pv.<file>_<n> { file, name, value, at }              an answer in the PDF's own form (pdfForm.js)
//
// A `signHere` mark is a request, not ink: an agent (or a person) flags
// where someone should sign, and it never prints in the export.
//
// Page sizes are PDF points (1/72 inch) of the page before any rotation.
// Marks are placed on the page as you see it (rotation applied), top-left
// origin, so what you place is exactly where it lands in the export.
import { newPartId, orderedIds, readParts } from '../office/officeParts.js';
import { readValues } from './pdfForm.js';

export const PDF_PART = Object.freeze({ file: 'pf', page: 'pp', mark: 'pm' });
export const MARK_TYPES = Object.freeze(['text', 'sign', 'highlight', 'redact', 'signHere']);
// Each PDF lives on the board, which every teammate downloads.
export const MAX_PDF_BYTES = 8 * 1024 * 1024;

export const pageKey = (id) => `${PDF_PART.page}.${id}`;
export const markKey = (id) => `${PDF_PART.mark}.${id}`;
export const fileKey = (id) => `${PDF_PART.file}.${id}`;

/** Rotation of a page as shown: what the file had plus what we turned. */
export function shownRotation(page) {
  return (((Number(page?.srcRot) || 0) + (Number(page?.rot) || 0)) % 360 + 360) % 360;
}

/** Width and height of a page as shown, in points. */
export function shownSize(page) {
  const sideways = shownRotation(page) % 180 !== 0;
  return sideways ? { w: page.h, h: page.w } : { w: page.w, h: page.h };
}

/** Everything the window needs, read from the window record. */
export function readPdf(win) {
  const files = readParts(win, PDF_PART.file);
  const rawPages = readParts(win, PDF_PART.page);
  const pages = {};
  for (const [id, p] of Object.entries(rawPages)) if (files[p.file]) pages[id] = p;
  const order = orderedIds(win?.pdfDoc?.order, pages);
  const marks = {};
  for (const [id, m] of Object.entries(readParts(win, PDF_PART.mark))) if (pages[m.page]) marks[id] = m;
  const marksByPage = {};
  for (const [id, m] of Object.entries(marks).sort((a, b) => (a[1].at || 0) - (b[1].at || 0))) {
    (marksByPage[m.page] ||= []).push(id);
  }
  return { files, pages, order, marks, marksByPage, values: readValues(win) };
}

/**
 * The patch that adds one PDF: its bytes, one part per page, appended to the
 * order. `info.pages` is [{ w, h, rot }] as read from the file.
 */
export function addFilePatch(doc, { name, data, bytes, pages }, now = Date.now()) {
  const fileId = newPartId('f');
  const patch = { [fileKey(fileId)]: { name: String(name || 'Document.pdf'), data, pages: pages.length, bytes: bytes || 0, at: now } };
  const ids = pages.map((p, index) => {
    const id = newPartId('p');
    patch[pageKey(id)] = { file: fileId, index, w: p.w, h: p.h, srcRot: p.rot || 0, rot: 0, at: now + index };
    return id;
  });
  patch.pdfDoc = { order: [...doc.order, ...ids] };
  return { fileId, pageIds: ids, patch };
}

/** Move a page to a new place in the order. */
export function movePagePatch(doc, id, toIndex) {
  const order = doc.order.filter((p) => p !== id);
  const at = Math.max(0, Math.min(order.length, toIndex));
  order.splice(at, 0, id);
  return { pdfDoc: { order } };
}

/** Remove pages and what was placed on them. Files with no pages left go too. */
export function removePagesPatch(doc, ids) {
  const gone = new Set(ids);
  const patch = { pdfDoc: { order: doc.order.filter((id) => !gone.has(id)) } };
  for (const id of gone) patch[pageKey(id)] = null;
  for (const [mid, m] of Object.entries(doc.marks)) if (gone.has(m.page)) patch[markKey(mid)] = null;
  const used = new Set(Object.entries(doc.pages).filter(([id]) => !gone.has(id)).map(([, p]) => p.file));
  for (const fid of Object.keys(doc.files)) if (!used.has(fid)) patch[fileKey(fid)] = null;
  return patch;
}

/**
 * Turn a page a quarter turn clockwise. Marks move with the page: boxes that
 * cover the page (highlight, black out) turn with it; text and signatures
 * stay upright and keep their size.
 */
export function rotatePagePatch(doc, id) {
  const page = doc.pages[id];
  if (!page) return {};
  const { h: shownH } = shownSize(page);
  const patch = { [pageKey(id)]: { ...page, rot: ((Number(page.rot) || 0) + 90) % 360 } };
  for (const mid of doc.marksByPage[id] || []) {
    const m = doc.marks[mid];
    if (m.type === 'highlight' || m.type === 'redact') {
      patch[markKey(mid)] = { ...m, x: shownH - m.y - m.h, y: m.x, w: m.h, h: m.w };
    } else {
      const cx = m.x + m.w / 2;
      const cy = m.y + m.h / 2;
      patch[markKey(mid)] = { ...m, x: shownH - cy - m.w / 2, y: cx - m.h / 2 };
    }
  }
  return patch;
}

/** Keep a box on its page. */
export function clampBox(box, size) {
  const w = Math.max(4, Math.min(box.w, size.w));
  const h = Math.max(4, Math.min(box.h, size.h));
  return { ...box, w, h, x: Math.max(0, Math.min(box.x, size.w - w)), y: Math.max(0, Math.min(box.y, size.h - h)) };
}

export function addMarkPatch(fields, now = Date.now()) {
  const id = newPartId('m');
  return { id, patch: { [markKey(id)]: { ...fields, at: now } } };
}

export function markPatch(id, mark) {
  return { [markKey(id)]: mark };
}

export function removeMarkPatch(id) {
  return { [markKey(id)]: null };
}

/** Rough box for a line of typed text in Helvetica, in points. */
export function textBox(text, size) {
  const lines = String(text || ' ').split('\n');
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return { w: Math.ceil(longest * size * 0.56) + 6, h: Math.ceil(lines.length * size * 1.25) + 4 };
}

export function makePdfDoc() {
  return { pdfDoc: { order: [] } };
}

// Build the finished PDF: pages in the board's order, turned as shown, with
// every mark drawn into the page itself. Runs in the browser (and in tests)
// with pdf-lib; nothing goes to a server.
import { readPdf, shownRotation, shownSize } from './pdfModel.js';
import { HIGHLIGHT_OPACITY, PDF_INK, hexToRgb01 } from './pdfColors.js';
import { fillForm } from './pdfForm.js';

let libPromise = null;
export function loadPdfLib() {
  libPromise ||= import('pdf-lib');
  return libPromise;
}

/**
 * Where a point on the page as shown (top-left origin, y down) lands in the
 * page's own PDF space (bottom-left origin, y up, before rotation).
 * `box` is the page's crop box { x, y, w, h }; `rot` the shown rotation.
 */
export function shownToPdf(dx, dy, box, rot) {
  const { x: x0, y: y0, w: W, h: H } = box;
  switch (rot) {
    case 90: return { x: x0 + dy, y: y0 + dx };
    case 180: return { x: x0 + W - dx, y: y0 + dy };
    case 270: return { x: x0 + W - dy, y: y0 + H - dx };
    default: return { x: x0 + dx, y: y0 + H - dy };
  }
}

/** Helvetica only knows Western characters; anything else prints as "?". */
export function printable(text) {
  return Array.from(String(text || '')).map((ch) => {
    const c = ch.codePointAt(0);
    return ch === '\n' || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) ? ch : '?';
  }).join('');
}

/** A signature's strokes (0..1 in its box) as an SVG path in points. */
export function strokesToPath(strokes, w, h) {
  const r = (n) => Math.round(n * 100) / 100;
  return (strokes || []).filter((s) => s.length >= 2).map((s) => {
    const pts = [];
    for (let i = 0; i + 1 < s.length; i += 2) pts.push(`${r(s[i] * w)} ${r(s[i + 1] * h)}`);
    if (pts.length === 1) pts.push(pts[0]);
    return `M ${pts[0]} L ${pts.slice(1).join(' L ')}`;
  }).join(' ');
}

function drawMark(page, mark, ctx) {
  const { lib, font, box, rot } = ctx;
  const rotate = lib.degrees(rot);
  const color = (hex) => { const c = hexToRgb01(hex); return lib.rgb(c.r, c.g, c.b); };
  if (mark.type === 'highlight' || mark.type === 'redact') {
    const at = shownToPdf(mark.x, mark.y + mark.h, box, rot);
    const hl = mark.type === 'highlight';
    page.drawRectangle({
      x: at.x, y: at.y, width: mark.w, height: mark.h, rotate,
      color: color(hl ? PDF_INK.highlight : PDF_INK.redact),
      opacity: hl ? HIGHLIGHT_OPACITY : 1,
      ...(hl ? { blendMode: lib.BlendMode.Multiply } : {}),
    });
    return;
  }
  if (mark.type === 'text') {
    const size = Number(mark.size) || 14;
    const lines = printable(mark.text).split('\n');
    lines.forEach((line, i) => {
      const at = shownToPdf(mark.x + 3, mark.y + 2 + size * (0.95 + i * 1.25), box, rot);
      if (line) page.drawText(line, { x: at.x, y: at.y, size, font, rotate, color: color(mark.color || PDF_INK.text) });
    });
    return;
  }
  if (mark.type === 'sign') {
    const path = strokesToPath(mark.strokes, mark.w, mark.h);
    if (!path) return;
    const at = shownToPdf(mark.x, mark.y, box, rot);
    page.drawSvgPath(path, {
      x: at.x, y: at.y, rotate,
      borderColor: color(PDF_INK.sign), borderWidth: Math.max(1, mark.w / 160),
      borderLineCap: lib.LineCapStyle.Round,
    });
  }
}

/**
 * The finished PDF as bytes, from a window record. Pages with something
 * blacked out are flattened into a picture when `flatten` is given (the
 * browser passes one), so the covered text is gone, not just hidden.
 * flatten(bytes, indexes) resolves to { [index]: pngBytes }.
 */
export async function buildPdf(win, lib, { flatten } = {}) {
  const L = lib || await loadPdfLib();
  const doc = readPdf(win);
  if (!doc.order.length) throw new Error('There are no pages to save. Open a PDF first.');
  const out = await L.PDFDocument.create();
  const sources = {};
  const font = await out.embedFont(L.StandardFonts.Helvetica);
  const redacted = [];
  for (const [i, id] of doc.order.entries()) {
    const p = doc.pages[id];
    if (!sources[p.file]) {
      sources[p.file] = await L.PDFDocument.load(doc.files[p.file].data, { ignoreEncryption: true });
      fillForm(L, sources[p.file], doc.values[p.file], printable);
    }
    const [page] = await out.copyPages(sources[p.file], [p.index]);
    out.addPage(page);
    const rot = shownRotation(p);
    page.setRotation(L.degrees(rot));
    const crop = page.getCropBox();
    const box = { x: crop.x, y: crop.y, w: crop.width, h: crop.height };
    const marks = (doc.marksByPage[id] || []).map((mid) => doc.marks[mid]).filter((m) => m.type !== 'signHere');
    for (const m of marks) drawMark(page, m, { lib: L, font, box, rot });
    if (marks.some((m) => m.type === 'redact')) redacted.push(i);
  }
  out.setProducer('censaiOS YorWare PDF');
  out.setCreator('censaiOS');
  const bytes = await out.save();
  if (!flatten || !redacted.length) return bytes;
  return flattenPages(L, bytes, redacted, await flatten(bytes, redacted), doc);
}

/** Swap the given pages for pictures of themselves, sized as shown. */
async function flattenPages(L, bytes, indexes, pngs, doc) {
  const src = await L.PDFDocument.load(bytes);
  const out = await L.PDFDocument.create();
  const flat = new Set(indexes);
  for (let i = 0; i < src.getPageCount(); i += 1) {
    if (flat.has(i) && pngs[i]) {
      const { w, h } = shownSize(doc.pages[doc.order[i]]);
      const img = await out.embedPng(pngs[i]);
      out.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h });
    } else {
      const [pg] = await out.copyPages(src, [i]);
      out.addPage(pg);
    }
  }
  out.setProducer('censaiOS YorWare PDF');
  out.setCreator('censaiOS');
  return out.save();
}

/** Page sizes and rotation as read from a PDF file, for addFilePatch. */
export async function readPageInfo(data, lib) {
  const L = lib || await loadPdfLib();
  const pdf = await L.PDFDocument.load(data, { ignoreEncryption: true });
  return pdf.getPages().map((pg) => {
    const c = pg.getCropBox();
    return { w: c.width, h: c.height, rot: ((pg.getRotation().angle % 360) + 360) % 360 };
  });
}

export { shownSize };

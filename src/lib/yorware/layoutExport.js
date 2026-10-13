// YorWare Layout to a print-ready PDF: every page at its exact size, text set
// in the PDF standard fonts (the same widths the screen broke lines with),
// pictures at full resolution, shapes as real vector paths. Runs in the
// browser (and in tests) with pdf-lib; nothing goes to a server.
import { readLayout } from './layoutModel.js';
import { flowDocument, imageBox, lineEnds, pageItems } from './layoutPlan.js';
import { fontKey } from './layoutFlow.js';
import { base64ToBytes } from './pdfBytes.js';
import { hexToRgb01 } from './pdfColors.js';
import { loadPdfLib } from './pdfExport.js';

const PDF_FONT = {
  sans: 'Helvetica', sansBold: 'HelveticaBold', serif: 'TimesRoman', serifBold: 'TimesRomanBold', mono: 'Courier', monoBold: 'CourierBold',
};
const painted = (c) => Boolean(c) && c !== 'none' && c !== 'transparent';

/** Build the PDF. `pageIds` limits it to some pages (default: all, in order). */
export async function buildLayoutPdf(win, lib, { pageIds } = {}) {
  const L = lib || await loadPdfLib();
  const doc = readLayout(win);
  const ids = pageIds || doc.order;
  if (!ids.length) throw new Error('There are no pages to save yet.');
  const out = await L.PDFDocument.create();
  const fonts = {};
  const font = async (key) => (fonts[key] ||= await out.embedFont(L.StandardFonts[PDF_FONT[key] || 'Helvetica']));
  const images = {};
  const image = async (iid) => {
    if (images[iid] !== undefined) return images[iid];
    const im = doc.images[iid];
    const bytes = base64ToBytes(im.data);
    try {
      images[iid] = im.mime === 'image/png' ? await out.embedPng(bytes) : await out.embedJpg(bytes);
    } catch {
      images[iid] = null;
    }
    return images[iid];
  };
  const flow = flowDocument(doc);
  for (const pageId of ids) {
    const page = out.addPage([doc.w, doc.h]);
    const ctx = { L, page, H: doc.h, font, image, doc };
    for (const item of pageItems(doc, pageId, flow)) await drawItem(ctx, item);
  }
  out.setTitle(String(win.title || 'Layout'));
  out.setProducer('censaiOS YorWare Layout');
  out.setCreator('censaiOS');
  return out.save();
}

async function drawItem({ L, page, H, font, image, doc }, { frame: f, text }) {
  const rgb = (hex) => { const c = hexToRgb01(hex); return L.rgb(c.r, c.g, c.b); };
  const opacity = f.opacity ?? 1;
  const box = { x: f.x, y: H - f.y - f.h, width: f.w, height: f.h };
  const stroke = painted(f.stroke) && (Number(f.sw) || 0) > 0 ? { borderColor: rgb(f.stroke), borderWidth: Number(f.sw), borderOpacity: opacity } : {};
  const fill = painted(f.fill) ? { color: rgb(f.fill), opacity } : {};
  if (f.type === 'rect' || (f.type === 'text' && (fill.color || stroke.borderColor)) || (f.type === 'image' && (fill.color || stroke.borderColor))) {
    if (fill.color || stroke.borderColor) page.drawRectangle({ ...box, ...fill, ...stroke });
  }
  if (f.type === 'ellipse' && (fill.color || stroke.borderColor)) {
    page.drawEllipse({ x: f.x + f.w / 2, y: H - f.y - f.h / 2, xScale: f.w / 2, yScale: f.h / 2, ...fill, ...stroke });
  }
  if (f.type === 'line' && painted(f.stroke)) {
    const e = lineEnds(f);
    page.drawLine({ start: { x: e.x1, y: H - e.y1 }, end: { x: e.x2, y: H - e.y2 }, thickness: Number(f.sw) || 1, color: rgb(f.stroke), opacity, lineCap: L.LineCapStyle.Round });
  }
  if (f.type === 'image' && f.img && doc.images[f.img]) {
    const img = await image(f.img);
    if (img) {
      const b = imageBox(f, doc.images[f.img]);
      // Clip to the frame so a filled picture's overflow is cropped away.
      page.pushOperators(L.pushGraphicsState(), L.rectangle(box.x, box.y, box.width, box.height), L.clip(), L.endPath());
      page.drawImage(img, { x: b.x, y: H - b.y - b.h, width: b.w, height: b.h, opacity });
      page.pushOperators(L.popGraphicsState());
    }
  }
  if (f.type === 'text' && text?.lines?.length) {
    const s = doc.stories[f.story] || {};
    const fnt = await font(fontKey(s));
    const size = Math.max(4, Number(s.size) || 12);
    for (const line of text.lines) {
      if (!line.text) continue;
      page.drawText(line.text, { x: line.x, y: H - line.y, size, font: fnt, color: rgb(s.color || '#111111'), opacity });
    }
  }
}

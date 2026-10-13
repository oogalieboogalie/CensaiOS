// Censai Slides -> .pptx (pptxgenjs) and .pdf (jsPDF), both 16:9 at
// 10 x 5.625 in, from the same percent boxes the editor uses.
import { ACCENT_BAR, SLIDE_H_IN, SLIDE_W_IN, THEMES, blockColor, textLines } from './slideModel.js';
import { dataUrlBytes, fitImage } from './officeImages.js';
import { loadPdf } from './pdfFlow.js';

const FONT = 'Calibri';
const inX = (pct) => (pct / 100) * SLIDE_W_IN;
const inY = (pct) => (pct / 100) * SLIDE_H_IN;

async function loadPptx() {
  const mod = await import('pptxgenjs');
  return mod.default?.default || mod.default || mod;
}

function rgb(hex) {
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/** Image box that keeps the picture's shape inside its frame. */
function imageBox(block) {
  const frameW = inX(block.w);
  const frameH = inY(block.h);
  const { width, height } = fitImage(block.iw || frameW, block.ih || frameH, frameW, frameH);
  return { x: inX(block.x) + (frameW - width) / 2, y: inY(block.y) + (frameH - height) / 2, w: width, h: height };
}

/** { order, slides, theme } -> .pptx bytes (Uint8Array). */
export async function deckToPptx({ order, slides, theme }, { title = 'Untitled' } = {}) {
  const PptxGen = await loadPptx();
  const t = THEMES[theme] || THEMES.censai;
  const pptx = new PptxGen();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = title;
  pptx.author = 'censaiOS';
  for (const id of order) {
    const slide = slides[id];
    const s = pptx.addSlide();
    s.background = { color: t.bg };
    s.addShape(pptx.ShapeType.rect, { x: inX(ACCENT_BAR.x), y: inY(ACCENT_BAR.y), w: inX(ACCENT_BAR.w), h: inY(ACCENT_BAR.h), fill: { color: t.accent }, line: { type: 'none' } });
    for (const block of slide.blocks || []) {
      if (block.type === 'image') {
        const parsed = dataUrlBytes(block.src);
        if (parsed) s.addImage({ data: block.src, ...imageBox(block), altText: block.alt || '' });
        continue;
      }
      const lines = textLines(block.text);
      if (!lines.some((l) => l.text.trim())) continue;
      s.addText(lines.map((l) => ({
        text: l.text,
        options: { bullet: l.bullet ? { indent: 18 } : false, breakLine: true },
      })), {
        x: inX(block.x), y: inY(block.y), w: inX(block.w), h: inY(block.h),
        fontFace: FONT, fontSize: block.size || 18, bold: Boolean(block.bold), color: blockColor(block, theme),
        align: block.align || 'left', valign: 'top', margin: 4, paraSpaceAfter: 6,
      });
    }
    if (slide.notes) s.addNotes(slide.notes);
  }
  return new Uint8Array(await pptx.write({ outputType: 'uint8array' }));
}

function pdfText(pdf, block, theme) {
  const W = SLIDE_W_IN * 72;
  const H = SLIDE_H_IN * 72;
  const x = (block.x / 100) * W + 4;
  const y = (block.y / 100) * H + 4;
  const w = (block.w / 100) * W - 8;
  const size = block.size || 18;
  pdf.setFont('helvetica', block.bold ? 'bold' : 'normal').setFontSize(size).setTextColor(...rgb(blockColor(block, theme)));
  let cursor = y + size * 0.95;
  for (const line of textLines(block.text)) {
    const indent = line.bullet ? size * 0.9 : 0;
    const wrapped = pdf.splitTextToSize(line.text || ' ', w - indent);
    wrapped.forEach((part, i) => {
      if (line.bullet && i === 0) pdf.text('•', x, cursor);
      const width = pdf.getTextWidth(part);
      const left = block.align === 'center' ? x + (w - width) / 2 : block.align === 'right' ? x + w - width : x + indent;
      pdf.text(part, left, cursor);
      cursor += size * 1.2;
    });
    cursor += size * 0.25;
  }
}

/** { order, slides, theme } -> .pdf bytes, one page per slide. */
export async function deckToPdf({ order, slides, theme }, { title = 'Untitled' } = {}) {
  const JsPdf = await loadPdf();
  const W = SLIDE_W_IN * 72;
  const H = SLIDE_H_IN * 72;
  const t = THEMES[theme] || THEMES.censai;
  const pdf = new JsPdf({ unit: 'pt', format: [W, H], orientation: 'landscape' });
  pdf.setProperties({ title, creator: 'censaiOS' });
  (order.length ? order : [null]).forEach((id, index) => {
    if (index > 0) pdf.addPage([W, H], 'landscape');
    pdf.setFillColor(...rgb(t.bg)).rect(0, 0, W, H, 'F');
    pdf.setFillColor(...rgb(t.accent)).rect((ACCENT_BAR.x / 100) * W, (ACCENT_BAR.y / 100) * H, (ACCENT_BAR.w / 100) * W, (ACCENT_BAR.h / 100) * H, 'F');
    for (const block of (id && slides[id]?.blocks) || []) {
      if (block.type !== 'image') { pdfText(pdf, block, theme); continue; }
      const parsed = dataUrlBytes(block.src);
      if (!parsed) continue;
      const box = imageBox(block);
      try {
        pdf.addImage(parsed.bytes, parsed.type === 'jpg' ? 'JPEG' : parsed.type.toUpperCase(), box.x * 72, box.y * 72, box.w * 72, box.h * 72, undefined, 'FAST');
      } catch {
        /* an unreadable picture is left out rather than failing the export */
      }
    }
  });
  return new Uint8Array(pdf.output('arraybuffer'));
}

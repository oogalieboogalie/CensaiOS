// Writer -> .pdf (Letter or A4, one-inch margins), laid out with PdfFlow over jsPDF.
import { listNumbers, parseInline } from './docModel.js';
import { dataUrlBytes, fitImage } from './officeImages.js';
import { PdfFlow, loadPdf } from './pdfFlow.js';
import { MARGIN_IN, PAGE_SIZES } from './docPages.js';

const HEADING = { h1: 22, h2: 16, h3: 13 };

/** { order, blocks } -> .pdf bytes (Uint8Array). */
export async function docToPdf({ order, blocks }, { title = 'Untitled', page = 'letter' } = {}) {
  const JsPdf = await loadPdf();
  const pdf = new JsPdf({ unit: 'pt', format: (PAGE_SIZES[page] || PAGE_SIZES.letter).pdf });
  pdf.setProperties({ title, creator: 'censaiOS' });
  const flow = new PdfFlow(pdf, { margin: MARGIN_IN * 72 });
  const nums = listNumbers(order, blocks);
  if (title) flow.paragraph([{ text: title }], { size: 26, base: { bold: true }, lead: 1.2, after: 14 });
  order.forEach((id, i) => {
    const b = blocks[id];
    const runs = parseInline(b.text || '');
    const nextIsList = ['bullet', 'number'].includes(blocks[order[i + 1]]?.type);
    switch (b.type) {
      case 'h1': case 'h2': case 'h3':
        flow.gap(HEADING[b.type] * 0.6);
        flow.paragraph(runs, { size: HEADING[b.type], base: { bold: true }, lead: 1.25, after: 4 });
        break;
      case 'bullet':
        flow.paragraph(runs, { indent: 22, marker: '•', after: nextIsList ? 2 : 8 });
        break;
      case 'number':
        flow.paragraph(runs, { indent: 22, marker: `${nums[id]}.`, after: nextIsList ? 2 : 8 });
        break;
      case 'quote': {
        const top = flow.y;
        flow.paragraph(runs, { indent: 16, base: { italic: true }, color: [72, 78, 88] });
        pdf.setDrawColor(229, 168, 58).setLineWidth(2);
        if (flow.y > top) pdf.line(flow.margin + 4, top + 2, flow.margin + 4, flow.y - 8);
        break;
      }
      case 'code': {
        const lines = String(b.text || '').split('\n');
        flow.paragraph([{ text: lines.join('\n') }], { size: 9.5, base: { mono: true }, indent: 8, lead: 1.4 });
        break;
      }
      case 'divider': flow.rule(); break;
      case 'table':
        flow.table((b.rows || []).map((row) => row.map((text) => parseInline(text))));
        break;
      case 'image': {
        const parsed = dataUrlBytes(b.src);
        if (!parsed) { flow.paragraph([{ text: `[image: ${b.alt || ''}]`, italic: true }]); break; }
        const { width, height } = fitImage(b.w, b.h, flow.width);
        try {
          flow.image({ bytes: parsed.bytes, type: parsed.type, width, height });
        } catch {
          flow.paragraph([{ text: `[image: ${b.alt || 'unreadable picture'}]`, italic: true }]);
        }
        break;
      }
      default:
        flow.paragraph(runs.length ? runs : [{ text: ' ' }]);
    }
  });
  return new Uint8Array(pdf.output('arraybuffer'));
}

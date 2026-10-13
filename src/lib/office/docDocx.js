// Censai Docs -> .docx through the `docx` library (loaded on demand).
// Real Word structure: heading styles, numbered and bulleted lists, tables,
// embedded images, so the file edits naturally in Word or Google Docs.
import { parseInline } from './docModel.js';
import { dataUrlBytes, fitImage } from './officeImages.js';
import { MARGIN_IN, PAGE_SIZES } from './docPages.js';

const MAX_IMAGE_W = 600;

async function loadDocx() {
  return import('docx');
}

function runs(d, text, extra = {}) {
  return parseInline(text).map((r) => {
    const opts = { text: r.text, bold: r.bold || extra.bold, italics: r.italic || extra.italics, ...(r.code ? { font: 'Consolas' } : {}) };
    if (r.link) return new d.ExternalHyperlink({ link: r.link, children: [new d.TextRun({ ...opts, style: 'Hyperlink' })] });
    return new d.TextRun(opts);
  });
}

function tableBlock(d, rows) {
  const width = Math.max(1, ...rows.map((r) => r.length));
  const border = { style: d.BorderStyle.SINGLE, size: 4, color: 'C8CCD2' };
  const borders = { top: border, bottom: border, left: border, right: border };
  return new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    rows: rows.map((row, r) => new d.TableRow({
      tableHeader: r === 0,
      children: Array.from({ length: width }, (_, c) => new d.TableCell({
        borders,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        shading: r === 0 ? { type: d.ShadingType.CLEAR, color: 'auto', fill: 'EEF1F4' } : undefined,
        children: [new d.Paragraph({ children: runs(d, row[c] || '', { bold: r === 0 }) })],
      })),
    })),
  });
}

function imageBlock(d, block) {
  const parsed = dataUrlBytes(block.src);
  if (!parsed) return new d.Paragraph({ children: [new d.TextRun({ text: `[image: ${block.alt || block.src || ''}]`, italics: true })] });
  const { width, height } = fitImage(block.w, block.h, MAX_IMAGE_W);
  return new d.Paragraph({
    alignment: d.AlignmentType.CENTER,
    children: [new d.ImageRun({ type: parsed.type, data: parsed.bytes, transformation: { width, height }, altText: { name: block.alt || 'image', description: block.alt || '', title: block.alt || 'image' } })],
  });
}

function blockToDocx(d, block, listIndex) {
  const text = block.text || '';
  switch (block.type) {
    case 'h1': return new d.Paragraph({ heading: d.HeadingLevel.HEADING_1, children: runs(d, text) });
    case 'h2': return new d.Paragraph({ heading: d.HeadingLevel.HEADING_2, children: runs(d, text) });
    case 'h3': return new d.Paragraph({ heading: d.HeadingLevel.HEADING_3, children: runs(d, text) });
    case 'bullet': return new d.Paragraph({ bullet: { level: 0 }, children: runs(d, text) });
    case 'number': return new d.Paragraph({ numbering: { reference: 'censai-numbers', level: 0, instance: listIndex }, children: runs(d, text) });
    case 'quote': return new d.Paragraph({
      indent: { left: 480 },
      border: { left: { style: d.BorderStyle.SINGLE, size: 12, color: 'E5A83A', space: 12 } },
      children: runs(d, text, { italics: true }),
    });
    case 'code': return new d.Paragraph({
      shading: { type: d.ShadingType.CLEAR, color: 'auto', fill: 'F2F4F6' },
      children: text.split('\n').map((line, i) => new d.TextRun({ text: line, font: 'Consolas', size: 19, break: i ? 1 : 0 })),
    });
    case 'divider': return new d.Paragraph({ border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: 'C8CCD2', space: 1 } }, children: [] });
    case 'table': return tableBlock(d, block.rows || [['']]);
    case 'image': return imageBlock(d, block);
    default: return new d.Paragraph({ children: runs(d, text) });
  }
}

/** { order, blocks } -> .docx bytes (Uint8Array). */
export async function docToDocx({ order, blocks }, { title = 'Untitled', page = 'letter' } = {}) {
  const d = await loadDocx();
  const children = title ? [new d.Paragraph({ heading: d.HeadingLevel.TITLE, children: [new d.TextRun({ text: title })] })] : [];
  let listIndex = 0;
  let prevType = null;
  for (const id of order) {
    const block = blocks[id];
    if (block.type === 'number' && prevType !== 'number') listIndex += 1;
    children.push(blockToDocx(d, block, listIndex));
    prevType = block.type;
  }
  if (!children.length) children.push(new d.Paragraph({ children: [] }));
  const twip = MARGIN_IN * 1440;
  const doc = new d.Document({
    creator: 'censaiOS',
    title,
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 }, paragraph: { spacing: { after: 120 } } },
        title: { run: { size: 48, bold: true, color: '15181D' }, paragraph: { spacing: { after: 240 } } },
        heading1: { run: { size: 32, bold: true, color: '15181D' }, paragraph: { spacing: { before: 240, after: 120 } } },
        heading2: { run: { size: 26, bold: true, color: '15181D' }, paragraph: { spacing: { before: 200, after: 80 } } },
        heading3: { run: { size: 22, bold: true, color: '15181D' }, paragraph: { spacing: { before: 160, after: 60 } } },
      },
    },
    numbering: {
      config: [{
        reference: 'censai-numbers',
        levels: [{ level: 0, format: d.LevelFormat.DECIMAL, text: '%1.', alignment: d.AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
      }],
    },
    sections: [{
      properties: { page: { size: (PAGE_SIZES[page] || PAGE_SIZES.letter).twips, margin: { top: twip, bottom: twip, left: twip, right: twip } } },
      children,
    }],
  });
  return new Uint8Array(await d.Packer.toArrayBuffer(doc));
}

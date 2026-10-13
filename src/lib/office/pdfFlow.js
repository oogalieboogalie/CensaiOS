// A small text-flow engine over jsPDF: wraps mixed bold/italic/code/link
// runs, breaks pages, and places images and tables. Used by the Docs PDF
// export. Units are PDF points.

export async function loadPdf() {
  const mod = await import('jspdf');
  return mod.jsPDF || mod.default?.jsPDF || mod.default;
}

const INK = [24, 27, 33];
const SOFT = [96, 104, 116];
const LINK = [138, 93, 0];

function styleOf(run, base) {
  const bold = run.bold || base.bold;
  const italic = run.italic || base.italic;
  if (run.code || base.mono) return { font: 'courier', style: bold ? 'bold' : 'normal' };
  return { font: 'helvetica', style: bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal' };
}

export class PdfFlow {
  constructor(pdf, { margin = 64 } = {}) {
    this.pdf = pdf;
    this.margin = margin;
    this.pageW = pdf.internal.pageSize.getWidth();
    this.pageH = pdf.internal.pageSize.getHeight();
    this.y = margin;
  }

  get width() {
    return this.pageW - this.margin * 2;
  }

  ensure(h) {
    if (this.y + h > this.pageH - this.margin) {
      this.pdf.addPage();
      this.y = this.margin;
    }
  }

  gap(h) {
    this.y += h;
  }

  /** Lay runs into lines no wider than `width`. */
  lines(runs, { size, base = {}, width }) {
    const { pdf } = this;
    const lines = [[]];
    let x = 0;
    for (const run of runs) {
      const st = styleOf(run, base);
      pdf.setFont(st.font, st.style).setFontSize(size);
      const parts = String(run.text).split(/(\n|\s+)/).filter((p) => p !== '');
      for (const part of parts) {
        if (part === '\n') { lines.push([]); x = 0; continue; }
        const w = pdf.getTextWidth(part);
        const space = /^\s+$/.test(part);
        if (!space && x + w > width && x > 0) { lines.push([]); x = 0; }
        if (space && x === 0) continue;
        const line = lines[lines.length - 1];
        const prev = line[line.length - 1];
        if (prev && prev.st === st && prev.link === run.link) prev.text += part;
        else line.push({ text: part, x, st, link: run.link });
        x += w;
      }
    }
    return lines;
  }

  /** A paragraph of runs. Options: size, base, indent, color, lead, marker. */
  paragraph(runs, { size = 11, base = {}, indent = 0, color = INK, lead = 1.45, marker, after = 6 } = {}) {
    const { pdf } = this;
    const width = this.width - indent;
    const lineH = size * lead;
    const lines = this.lines(runs, { size, base, width });
    lines.forEach((line, i) => {
      this.ensure(lineH);
      const baseline = this.y + size;
      if (i === 0 && marker) {
        pdf.setFont('helvetica', 'normal').setFontSize(size).setTextColor(...SOFT);
        pdf.text(marker, this.margin + indent - 14, baseline);
      }
      for (const word of line) {
        pdf.setFont(word.st.font, word.st.style).setFontSize(size);
        const x = this.margin + indent + word.x;
        if (word.link) {
          pdf.setTextColor(...LINK);
          pdf.textWithLink(word.text, x, baseline, { url: word.link });
        } else {
          pdf.setTextColor(...color);
          pdf.text(word.text, x, baseline);
        }
      }
      this.y += lineH;
    });
    this.y += after;
    return lines.length * lineH;
  }

  rule() {
    this.ensure(14);
    this.pdf.setDrawColor(200, 204, 210).setLineWidth(0.75);
    this.pdf.line(this.margin, this.y + 6, this.pageW - this.margin, this.y + 6);
    this.y += 16;
  }

  image({ bytes, type, width, height }) {
    const fit = Math.min(1, this.width / width, (this.pageH - this.margin * 2) / height);
    const w = width * fit;
    const h = height * fit;
    this.ensure(h);
    this.pdf.addImage(bytes, type === 'jpg' ? 'JPEG' : type.toUpperCase(), this.margin + (this.width - w) / 2, this.y, w, h, undefined, 'FAST');
    this.y += h + 10;
  }

  /** Rows of runs-lists; the first row is the header. */
  table(rows, { size = 10 } = {}) {
    const { pdf } = this;
    const cols = Math.max(1, ...rows.map((r) => r.length));
    const colW = this.width / cols;
    const pad = 5;
    rows.forEach((row, r) => {
      const cellLines = Array.from({ length: cols }, (_, c) => this.lines(row[c] || [], { size, base: { bold: r === 0 }, width: colW - pad * 2 }));
      const h = Math.max(...cellLines.map((l) => l.length)) * size * 1.35 + pad * 2;
      this.ensure(h);
      if (r === 0) {
        pdf.setFillColor(238, 241, 244);
        pdf.rect(this.margin, this.y, this.width, h, 'F');
      }
      pdf.setDrawColor(200, 204, 210).setLineWidth(0.5);
      cellLines.forEach((lines, c) => {
        const x0 = this.margin + c * colW;
        pdf.rect(x0, this.y, colW, h);
        lines.forEach((line, i) => line.forEach((word) => {
          pdf.setFont(word.st.font, word.st.style).setFontSize(size).setTextColor(...INK);
          pdf.text(word.text, x0 + pad + word.x, this.y + pad + size + i * size * 1.35);
        }));
      });
      this.y += h;
    });
    this.y += 10;
  }
}

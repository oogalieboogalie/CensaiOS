// What an agent sees of, and changes in, a YorWare PDF window. Pure work on
// a window record with pdf.js (text) and pdf-lib (form); reading the board
// and saving the changes are in pdfTools.js.
import * as PdfLib from 'pdf-lib';
import { base64ToBytes } from '../../src/lib/yorware/pdfBytes.js';
import { addMarkPatch, clampBox, readPdf, shownRotation, shownSize } from '../../src/lib/yorware/pdfModel.js';
import { formFieldsOf, shownValue, valuePatch } from '../../src/lib/yorware/pdfForm.js';
import { findInPieces, joinPieces, piecesOfPage, rectToShown } from '../../src/lib/yorware/pdfText.js';

export const MAX_READ_CHARS = 24000;
const FLAG = { w: 180, h: 40 };
const KIND = { text: 'text', check: 'tick box', radio: 'one of', choice: 'pick one', signature: 'signature box' };

export function pdfError(message, code = 'INVALID_PDF_REQUEST', statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

/** Opened files of a window, each read once per call. */
function fileReader(doc) {
  const js = new Map();
  const lib = new Map();
  return {
    async js(fileId) {
      if (!js.has(fileId)) {
        js.set(fileId, import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjs) => pdfjs.getDocument({
          data: base64ToBytes(doc.files[fileId].data), isEvalSupported: false, verbosity: 0, disableFontFace: true,
        }).promise));
      }
      return js.get(fileId);
    },
    async fields(fileId) {
      if (!lib.has(fileId)) {
        lib.set(fileId, PdfLib.PDFDocument.load(base64ToBytes(doc.files[fileId].data), { ignoreEncryption: true })
          .then((pdf) => formFieldsOf(PdfLib, pdf)).catch(() => []));
      }
      return lib.get(fileId);
    },
  };
}

async function pagePieces(reader, page) {
  const pdf = await reader.js(page.file);
  return piecesOfPage(await pdf.getPage(page.index + 1), shownRotation(page));
}

/** Every field still on a shown page: [{ fileId, field, spots: [{ pageId, number, box }] }]. */
async function placedFields(doc, reader) {
  const out = [];
  for (const fileId of Object.keys(doc.files)) {
    for (const field of await reader.fields(fileId)) {
      const spots = [];
      for (const w of field.widgets) {
        doc.order.forEach((pageId, i) => {
          const p = doc.pages[pageId];
          if (p.file !== fileId || p.index !== w.index) return;
          spots.push({ pageId, number: i + 1, box: rectToShown(w, p.w, p.h, shownRotation(p)) });
        });
      }
      if (spots.length) out.push({ fileId, field, spots });
    }
  }
  return out;
}

const showValue = (field, v) => (field.type === 'check' ? (v ? 'ticked' : 'not ticked') : `"${v ?? ''}"`);

/** A plain-text report of the PDF: pages with their words, the form, and flags. */
export async function describePdf(win, { fromPage, toPage } = {}) {
  const doc = readPdf(win);
  const count = doc.order.length;
  if (!count) return `PDF "${win.title || 'Untitled PDF'}" has no pages yet.`;
  const from = Math.max(1, Math.min(count, Number(fromPage) || 1));
  const to = Math.max(from, Math.min(count, Number(toPage) || count));
  const reader = fileReader(doc);
  const names = Object.values(doc.files).map((f) => f.name).join(', ');
  const lines = [`PDF "${win.title || 'Untitled PDF'}" — ${count} page${count === 1 ? '' : 's'} (files: ${names}). Showing pages ${from}-${to}.`];
  let used = 0;
  let cut = false;
  for (let n = from; n <= to; n += 1) {
    const page = doc.pages[doc.order[n - 1]];
    const size = shownSize(page);
    let text = '';
    try { text = joinPieces(await pagePieces(reader, page)).text.trim(); } catch { text = '(this page\'s text could not be read)'; }
    if (used + text.length > MAX_READ_CHARS) { text = `${text.slice(0, Math.max(0, MAX_READ_CHARS - used))}…`; cut = true; }
    used += text.length;
    lines.push('', `--- Page ${n} (${doc.files[page.file].name} page ${page.index + 1}, ${Math.round(size.w)}×${Math.round(size.h)} pt) ---`, text || '(no text: probably a scan or a picture)');
    if (cut) { lines.push('', `(Text stops here; read later pages with from_page=${n + 1}.)`); break; }
  }
  const fields = await placedFields(doc, reader);
  if (fields.length) {
    lines.push('', 'Form fields (fill with fill_pdf_field; sign with sign_here):');
    for (const { fileId, field, spots } of fields) {
      const opts = field.options?.length ? ` options: ${field.options.join(' / ')}` : '';
      const value = field.type === 'signature' ? 'needs a signature' : showValue(field, shownValue(field, doc.values[fileId]));
      lines.push(`• "${field.name}" (${KIND[field.type]}${field.readOnly ? ', read-only' : ''}) on page ${[...new Set(spots.map((s) => s.number))].join(', ')} = ${value}${opts}`);
    }
  } else {
    lines.push('', 'This PDF has no fill-in form fields.');
  }
  const marks = Object.values(doc.marks);
  const flags = marks.filter((m) => m.type === 'signHere');
  for (const f of flags) lines.push(`Sign-here flag on page ${doc.order.indexOf(f.page) + 1}${f.signer ? ` for ${f.signer}` : ''}${f.note ? `: ${f.note}` : ''}.`);
  const signed = marks.filter((m) => m.type === 'sign').length;
  const typed = marks.filter((m) => m.type === 'text').map((m) => `"${m.text}" on page ${doc.order.indexOf(m.page) + 1}`);
  if (signed) lines.push(`${signed} signature${signed === 1 ? '' : 's'} placed.`);
  if (typed.length) lines.push(`Typed on the pages: ${typed.join('; ')}.`);
  return lines.join('\n');
}

function findField(fields, name) {
  const want = String(name || '').trim();
  if (!want) throw pdfError('field is required: the exact field name from read_pdf.');
  const exact = fields.filter((f) => f.field.name === want);
  const hits = exact.length ? exact : fields.filter((f) => f.field.name.toLowerCase() === want.toLowerCase());
  if (!hits.length) throw pdfError(`There is no form field called "${want}". Use read_pdf to list the fields.`, 'PDF_FIELD_NOT_FOUND', 404);
  return hits;
}

/** The patch that fills one form field; { patch, field, value, pages }. */
export async function fillFieldPatch(win, name, value) {
  const doc = readPdf(win);
  const hits = findField(await placedFields(doc, fileReader(doc)), name);
  const { field } = hits[0];
  if (field.readOnly) throw pdfError(`"${field.name}" is read-only in this PDF.`, 'PDF_FIELD_READ_ONLY', 422);
  if (field.type === 'signature') throw pdfError(`"${field.name}" is a signature box. Agents never sign; use sign_here to ask a person to sign it.`, 'PDF_FIELD_SIGNATURE', 422);
  if (value === undefined || value === null) throw pdfError('value is required (text, the option name, or true/false for a tick box).');
  let patch = {};
  for (const hit of hits) patch = { ...patch, ...valuePatch(hit.fileId, field, value) };
  const stored = Object.values(patch)[0].value;
  if ((field.type === 'radio' || field.type === 'choice') && stored === null) {
    throw pdfError(`"${value}" is not one of the options for "${field.name}": ${field.options.join(' / ')}.`, 'PDF_FIELD_OPTION', 422);
  }
  return { patch, field, value: stored, pages: [...new Set(hits.flatMap((h) => h.spots.map((s) => s.number)))] };
}

function besideText(hit, size) {
  const right = { x: hit.x + hit.w + 8, y: hit.y + hit.h / 2 - FLAG.h / 2 };
  if (right.x + FLAG.w <= size.w) return right;
  return { x: hit.x, y: hit.y + hit.h + 4 };
}

/** The patch that adds a "sign here" flag; { id, patch, pageNumber, how }. */
export async function signHerePatch(win, { page, nearText, field, signer, note, agentId } = {}) {
  const doc = readPdf(win);
  if (!doc.order.length) throw pdfError('This PDF has no pages yet.', 'PDF_EMPTY', 422);
  const reader = fileReader(doc);
  const wanted = Number(page) || null;
  if (wanted && (wanted < 1 || wanted > doc.order.length)) throw pdfError(`page must be between 1 and ${doc.order.length}.`);
  let spot = null;
  let how = '';
  if (field || (!nearText && !wanted)) {
    const fields = await placedFields(doc, reader);
    const pool = field ? findField(fields, field) : fields.filter((f) => f.field.type === 'signature');
    const s = pool.flatMap((f) => f.spots).find((x) => !wanted || x.number === wanted);
    if (!s) throw pdfError(field ? `"${field}" is not on page ${wanted}.` : 'Say where: give page, near_text (words printed next to the signature line) or field.', 'PDF_PLACE_UNKNOWN', 422);
    spot = { pageId: s.pageId, box: { x: s.box.x, y: s.box.y, w: Math.max(s.box.w, 60), h: Math.max(s.box.h, 24) } };
    how = `on the "${pool[0].field.name}" box`;
  } else if (nearText) {
    const numbers = wanted ? [wanted] : doc.order.map((_, i) => i + 1);
    for (const n of numbers) {
      const p = doc.pages[doc.order[n - 1]];
      const hit = findInPieces(await pagePieces(reader, p).catch(() => []), nearText)[0];
      if (!hit?.boxes.length) continue;
      const last = hit.boxes[hit.boxes.length - 1];
      spot = { pageId: doc.order[n - 1], box: { ...besideText(last, shownSize(p)), ...FLAG } };
      how = `next to "${nearText}"`;
      break;
    }
    if (!spot) throw pdfError(`"${nearText}" was not found${wanted ? ` on page ${wanted}` : ''}. Check the words with read_pdf.`, 'PDF_TEXT_NOT_FOUND', 404);
  } else {
    const size = shownSize(doc.pages[doc.order[wanted - 1]]);
    spot = { pageId: doc.order[wanted - 1], box: { x: size.w - FLAG.w - 50, y: size.h - FLAG.h - 70, ...FLAG } };
    how = 'at the bottom of the page';
  }
  const size = shownSize(doc.pages[spot.pageId]);
  const fields = {
    page: spot.pageId, type: 'signHere', ...clampBox(spot.box, size),
    signer: String(signer || '').trim().slice(0, 80), note: String(note || '').trim().slice(0, 200), by: String(agentId || ''),
  };
  const { id, patch } = addMarkPatch(fields);
  return { id, patch, pageNumber: doc.order.indexOf(spot.pageId) + 1, how };
}

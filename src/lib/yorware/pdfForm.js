// The form a PDF carries (its own fill-in boxes, tick boxes and choices),
// read with pdf-lib. The boxes come from the file, which never changes once
// added, so only the answers live on the board, one field per answer, so two
// people filling different boxes merge:
//
//   pv.<fileId>_<nameHash>   { file, name, value, at }
//
// A text or choice answer is a string, a tick box is true/false, a round
// (radio) choice is the picked option's name. Used by the window, the export
// and the agent tools on the server.
import { readParts } from '../office/officeParts.js';

export const VALUE_PART = 'pv';
export const FIELD_TYPES = Object.freeze(['text', 'check', 'radio', 'choice', 'signature']);
const MAX_VALUE_LENGTH = 4000;

/** Short stable id for a field name (names can hold dots and spaces). */
export function nameHash(name) {
  let h = 5381;
  for (const ch of String(name)) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return h.toString(36);
}

export const valueKey = (fileId, name) => `${VALUE_PART}.${fileId}_${nameHash(name)}`;

/** Every answer on the board: { [fileId]: { [fieldName]: value } }. */
export function readValues(win) {
  const out = {};
  for (const v of Object.values(readParts(win, VALUE_PART))) {
    if (!v || typeof v !== 'object' || !v.file || typeof v.name !== 'string') continue;
    (out[v.file] ||= {})[v.name] = v.value;
  }
  return out;
}

/** Clean an answer for its kind of field. */
export function cleanValue(field, value) {
  if (field.type === 'check') return value === true || value === 'true' || value === 'yes' || value === 1 || value === 'on';
  const text = String(value ?? '').slice(0, MAX_VALUE_LENGTH);
  if ((field.type === 'radio' || field.type === 'choice') && text && field.options?.length && !field.options.includes(text)) {
    const lower = text.toLowerCase();
    return field.options.find((o) => o.toLowerCase() === lower) ?? null;
  }
  return field.multiline || field.type !== 'text' ? text : text.replace(/\s*\n\s*/g, ' ');
}

export function valuePatch(fileId, field, value, now = Date.now()) {
  return { [valueKey(fileId, field.name)]: { file: fileId, name: field.name, value: cleanValue(field, value), at: now } };
}

/** The answer shown for a field: what the board holds, else what the file had. */
export function shownValue(field, values) {
  return values && Object.prototype.hasOwnProperty.call(values, field.name) ? values[field.name] : field.value;
}

function fieldType(L, f) {
  if (f instanceof L.PDFTextField) return 'text';
  if (f instanceof L.PDFCheckBox) return 'check';
  if (f instanceof L.PDFRadioGroup) return 'radio';
  if (f instanceof L.PDFDropdown || f instanceof L.PDFOptionList) return 'choice';
  if (f instanceof L.PDFSignature) return 'signature';
  return null;
}

function currentValue(type, f) {
  try {
    if (type === 'text') return f.getText() || '';
    if (type === 'check') return f.isChecked();
    if (type === 'radio') return f.getSelected() || '';
    if (type === 'choice') return f.getSelected()?.[0] || '';
  } catch { /* a damaged field reads as empty */ }
  return type === 'check' ? false : '';
}

/**
 * The fields of a loaded pdf-lib document, with where each box sits:
 * `widgets` [{ index (page in this file), x, y, w, h }] in PDF points from
 * the page's crop-box corner (bottom-left, y up), before any turning.
 */
export function formFieldsOf(L, pdf) {
  let form;
  try { form = pdf.getForm(); } catch { return []; }
  const pages = pdf.getPages();
  const pageOfRef = new Map();
  pages.forEach((pg, i) => {
    const annots = pg.node.Annots?.();
    for (let k = 0; annots && k < annots.size(); k += 1) pageOfRef.set(String(annots.get(k)), i);
  });
  const out = [];
  for (const f of form.getFields()) {
    const type = fieldType(L, f);
    if (!type) continue;
    const widgets = [];
    for (const w of f.acroField.getWidgets()) {
      const ref = pdf.context.getObjectRef(w.dict);
      let index = ref ? pageOfRef.get(String(ref)) : undefined;
      if (index === undefined) {
        const p = w.P?.();
        index = p ? pages.findIndex((pg) => pg.ref === p || String(pg.ref) === String(p)) : -1;
      }
      if (index === undefined || index < 0) continue;
      const r = w.getRectangle();
      const crop = pages[index].getCropBox();
      widgets.push({ index, x: r.x - crop.x, y: r.y - crop.y, w: Math.abs(r.width), h: Math.abs(r.height) });
    }
    if (!widgets.length) continue;
    let options = [];
    try { if (type === 'radio' || type === 'choice') options = f.getOptions().map(String); } catch { options = []; }
    let multiline = false;
    try { multiline = type === 'text' && f.isMultiline(); } catch { multiline = false; }
    let readOnly = false;
    try { readOnly = f.isReadOnly(); } catch { readOnly = false; }
    out.push({ name: f.getName(), type, value: currentValue(type, f), options, multiline, readOnly, widgets });
  }
  return out;
}

export async function readFormFields(L, bytes) {
  const pdf = await L.PDFDocument.load(bytes, { ignoreEncryption: true });
  return formFieldsOf(L, pdf);
}

/**
 * Write the board's answers into a loaded source PDF and print them into the
 * pages (flatten), so they survive the page copy and show in every reader.
 * `clean` makes typed text safe for the standard font.
 */
export function fillForm(L, pdf, values, clean = (s) => s) {
  if (!values || !Object.keys(values).length) return false;
  let form;
  try { form = pdf.getForm(); } catch { return false; }
  for (const [name, value] of Object.entries(values)) {
    let f;
    try { f = form.getField(name); } catch { continue; }
    try {
      if (f instanceof L.PDFTextField) {
        const max = f.getMaxLength?.();
        const text = clean(String(value ?? ''));
        // Many forms say "auto size", which pdf-lib prints as large as the
        // box allows; use a normal reading size instead.
        const boxH = f.acroField.getWidgets()[0]?.getRectangle().height || 20;
        try { f.setFontSize(f.isMultiline() ? 10 : Math.max(6, Math.min(12, boxH * 0.6))); } catch { /* keep the form's own size */ }
        f.setText(max ? text.slice(0, max) : text);
      } else if (f instanceof L.PDFCheckBox) {
        if (value) f.check(); else f.uncheck();
      } else if (f instanceof L.PDFRadioGroup || f instanceof L.PDFDropdown || f instanceof L.PDFOptionList) {
        if (value) f.select(String(value)); else f.clear();
        const boxH = f.acroField.getWidgets()[0]?.getRectangle().height || 20;
        if (f instanceof L.PDFDropdown) try { f.setFontSize(Math.max(6, Math.min(12, boxH * 0.6))); } catch { /* keep the form's own size */ }
      }
    } catch { /* an answer the field refuses (too long, unknown option) is skipped */ }
  }
  try { form.flatten(); } catch { /* keep the filled, unflattened form */ }
  return true;
}

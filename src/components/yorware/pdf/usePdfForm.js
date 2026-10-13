// The form fields each added PDF carries, read once per file with pdf-lib
// (loaded only when a PDF window opens). Files never change once added.
import React from 'react';
import { loadPdfLib } from '../../../lib/yorware/pdfExport.js';
import { readFormFields } from '../../../lib/yorware/pdfForm.js';
import { base64ToBytes } from '../../../lib/yorware/pdfBytes.js';

const cache = new Map();

function fieldsFor(fileId, data) {
  if (!cache.has(fileId)) {
    cache.set(fileId, loadPdfLib().then((L) => readFormFields(L, base64ToBytes(data))).catch(() => []));
  }
  return cache.get(fileId);
}

/** { [fileId]: fields } for every file in the document, filled in as they load. */
export function usePdfForm(doc) {
  const [byFile, setByFile] = React.useState({});
  const ids = Object.keys(doc.files).sort().join(',');
  React.useEffect(() => {
    let live = true;
    for (const [id, f] of Object.entries(doc.files)) {
      fieldsFor(id, f.data).then((fields) => { if (live) setByFile((prev) => (prev[id] === fields ? prev : { ...prev, [id]: fields })); });
    }
    return () => { live = false; };
  }, [ids]); // files never change once added
  return byFile;
}

/** The boxes on one page: [{ field, widget, n }] (n = which box of a round choice). */
export function boxesOnPage(byFile, page) {
  if (!page) return [];
  const out = [];
  for (const field of byFile[page.file] || []) {
    field.widgets.forEach((widget, n) => { if (widget.index === page.index) out.push({ field, widget, n }); });
  }
  return out;
}

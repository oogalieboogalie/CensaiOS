// Drawing PDF pages in the browser with pdf.js (Apache-2.0). Loaded only
// when a PDF window opens, so the rest of censaiOS stays light. The legacy
// build runs in older desktop webviews too.
import { base64ToBytes } from './pdfBytes.js';
import { piecesOfPage } from './pdfText.js';

let pdfjsPromise = null;
function loadPdfJs() {
  pdfjsPromise ||= Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return pdfjsPromise;
}

// One open pdf.js document per added file, shared by every window and
// thumbnail that shows it. Files never change once added, so the id is enough.
const docs = new Map();

export function openPdf(fileId, base64) {
  if (!docs.has(fileId)) {
    const p = loadPdfJs().then((pdfjs) => pdfjs.getDocument({ data: base64ToBytes(base64), isEvalSupported: false }).promise);
    p.catch(() => docs.delete(fileId));
    docs.set(fileId, p);
  }
  return docs.get(fileId);
}

// Text of each page, read once per file, page and turn (for search).
const texts = new Map();

/** A page's text pieces boxed on the page as shown (see pdfText.js). */
export function pageText(fileId, data, index, rotation = 0) {
  const key = `${fileId}:${index}:${rotation}`;
  if (!texts.has(key)) {
    const p = openPdf(fileId, data).then((pdf) => pdf.getPage(index + 1)).then((page) => piecesOfPage(page, rotation));
    p.catch(() => texts.delete(key));
    texts.set(key, p);
  }
  return texts.get(key);
}

/**
 * Draw one page into a canvas at `scale` (points to CSS pixels), turned to
 * `rotation`. Returns a cancel function. Renders sharp on high-DPI screens.
 */
export function drawPage(canvas, { fileId, data, index, rotation, scale }) {
  let task = null;
  let cancelled = false;
  (async () => {
    const pdf = await openPdf(fileId, data);
    if (cancelled) return;
    const page = await pdf.getPage(index + 1);
    if (cancelled) return;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const viewport = page.getViewport({ scale: scale * dpr, rotation });
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
    await task.promise.catch(() => {});
  })().catch(() => {});
  return () => { cancelled = true; task?.cancel?.(); };
}

/** The first page of a finished PDF as a PNG blob (marks are already baked in). */
export async function firstPageToPng(bytes, scale = 2) {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be made.'))), 'image/png'));
  } finally {
    task.destroy();
  }
}

/**
 * Pictures of some pages of a finished PDF, as PNG bytes by page index, for
 * flattening blacked-out pages. 2.5x is about 180 dots per inch.
 */
export async function pagesToPng(bytes, indexes, scale = 2.5) {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false });
  try {
    const pdf = await task.promise;
    const out = {};
    for (const i of indexes) {
      const page = await pdf.getPage(i + 1);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      out[i] = new Uint8Array(await blob.arrayBuffer());
    }
    return out;
  } finally {
    task.destroy();
  }
}

// Receipt photos and PDFs for YorWare Books. Photos are shrunk to a JPEG
// working copy before they go on the board (every teammate downloads the
// board); PDFs go on as they are, up to a size limit.
export const RECEIPT_ACCEPT = 'application/pdf,image/*';
const MAX_EDGE = 1600;
const MAX_PDF_BYTES = 2 * 1024 * 1024;
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

const readAsDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error('Could not read that file.'));
  r.readAsDataURL(blob);
});

async function shrinkPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('That photo could not be opened. Try a JPEG or PNG.'));
      el.src = url;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A File into { name, type, src } ready for the board. */
export async function receiptFile(file) {
  if (!file) return null;
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) throw new Error('That PDF is over 2 MB. Save the receipt page alone, or take a photo of it.');
    return { name: file.name, type: 'application/pdf', src: await readAsDataUrl(file) };
  }
  if (!file.type.startsWith('image/')) throw new Error('Add a photo or a PDF.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('That photo is over 25 MB. Try a smaller copy.');
  return { name: file.name, type: 'image/jpeg', src: await shrinkPhoto(file) };
}

/**
 * A teammate (or an agent) can write any text into a receipt's file, so the
 * stored type is never trusted: a receipt shows only as a JPEG or a PDF,
 * never as a page that could run code.
 */
export const receiptFileType = (file) => (file?.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg');

/** The picture to show for an image receipt, or '' if it isn't one. */
export function receiptThumbSrc(file) {
  const src = String(file?.src || '');
  return receiptFileType(file) === 'image/jpeg' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src) ? src : '';
}

/** Opens a stored receipt file in a new browser tab. */
export function openReceiptFile(file) {
  const m = /^data:[^,]*;base64,([A-Za-z0-9+/=]+)$/.exec(String(file?.src || ''));
  if (!m) return;
  let bytes;
  try { bytes = Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)); } catch { return; }
  const url = URL.createObjectURL(new Blob([bytes], { type: receiptFileType(file) }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

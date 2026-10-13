// Word (.docx) -> Writer blocks, through mammoth (BSD-2-Clause, loaded on
// demand). Pictures come in as data URLs, sized the way the editor sizes a
// picked picture so a big scan does not bloat the board.
import { htmlToBlocks } from './docHtml.js';
import { MAX_IMAGE_EDGE, fitImage } from './officeImages.js';

async function loadMammoth() {
  const mod = await import('mammoth');
  return mod.default || mod;
}

function imageSize(src) {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Browser: shrink a picture over MAX_IMAGE_EDGE and note its size. */
async function sizedImage(block) {
  const size = await imageSize(block.src);
  if (!size || !size.w) return block;
  const { width, height } = fitImage(size.w, size.h, MAX_IMAGE_EDGE, MAX_IMAGE_EDGE);
  if (width === size.w || typeof document === 'undefined') return { ...block, w: width, h: height };
  const img = new Image();
  await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; img.src = block.src; });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return { ...block, src: canvas.toDataURL('image/jpeg', 0.86), w: width, h: height };
}

/**
 * .docx bytes (ArrayBuffer, or a Node Buffer in tests) -> { title, blocks }.
 * A leading "Title" or first heading becomes the document's title, the way
 * Export writes it, so a Writer file round-trips.
 */
export async function docxToDoc(bytes) {
  const mammoth = await loadMammoth();
  const input = typeof Buffer !== 'undefined' && Buffer.isBuffer(bytes) ? { buffer: bytes } : { arrayBuffer: bytes };
  const { value } = await mammoth.convertToHtml(input, {
    styleMap: ["p[style-name='Title'] => h1.title:fresh", "p[style-name='Quote'] => blockquote:fresh", "p[style-name='Intense Quote'] => blockquote:fresh"],
  });
  const blocks = htmlToBlocks(value);
  const sized = await Promise.all(blocks.map((b) => (b.type === 'image' ? sizedImage(b) : b)));
  const title = sized[0]?.type === 'h1' ? sized.shift().text : '';
  return { title, blocks: sized };
}

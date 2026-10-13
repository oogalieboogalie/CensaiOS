// Ink for what people add to a PDF. These are marks on the paper, not
// interface colors, so they live here as plain values. The highlighter is
// Ultem amber.
export const PDF_INK = Object.freeze({
  text: '#111111',
  sign: '#1d2a5b',
  highlight: '#e5a83a',
  redact: '#000000',
});

export const HIGHLIGHT_OPACITY = 0.38;

/** "#e5a83a" -> { r, g, b } in 0..1 for pdf-lib. */
export function hexToRgb01(hex) {
  const m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
  const n = m ? parseInt(m[1], 16) : 0;
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

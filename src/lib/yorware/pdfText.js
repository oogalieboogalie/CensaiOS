// Finding words in a PDF and where they sit on the page as you see it.
// pdf.js reads each page's text as pieces with a position; these pure
// helpers turn those pieces into boxes on the shown page (turned, top-left
// origin, points) and find a search word across them. The window and the
// agent tools on the server share them.

/** Where a point in the page's own PDF space (crop corner, y up) lands on the shown page. */
export function pdfToShown(x, y, W, H, rot) {
  switch (rot) {
    case 90: return { x: y, y: x };
    case 180: return { x: W - x, y };
    case 270: return { x: H - y, y: W - x };
    default: return { x, y: H - y };
  }
}

/** A box in PDF space { x, y, w, h } as a box on the shown page. */
export function rectToShown(r, W, H, rot) {
  const a = pdfToShown(r.x, r.y, W, H, rot);
  const b = pdfToShown(r.x + r.w, r.y + r.h, W, H, rot);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/**
 * pdf.js text pieces as { str, eol, box } with the box on the shown page.
 * `toView([x1, y1, x2, y2])` maps a box through the page viewport at scale 1
 * with the shown rotation (viewRect), so crop and turning are handled.
 */
export function textPieces(items, toView) {
  const out = [];
  for (const it of items || []) {
    if (typeof it?.str !== 'string') continue;
    const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = it.transform || [];
    const size = Math.hypot(c, d) || Math.hypot(a, b) || it.height || 10;
    const width = it.width || size * 0.5 * it.str.length;
    const angle = Math.atan2(b, a);
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    // The text's own box: from a little under the baseline to the cap height.
    const corners = [[0, -0.22], [width / size, -0.22], [width / size, 0.9], [0, 0.9]]
      .map(([s, t]) => [e + (s * ux - t * uy) * size, f + (s * uy + t * ux) * size]);
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    const [x1, y1, x2, y2] = toView([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
    // Reading direction on screen, so part of a piece can be boxed.
    const [sx1, sy1] = toView([e, f, e, f]);
    const [sx2, sy2] = toView([e + ux * width, f + uy * width, e + ux * width, f + uy * width]);
    out.push({
      str: it.str, eol: Boolean(it.hasEOL),
      box: { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) },
      dir: Math.abs(sx2 - sx1) >= Math.abs(sy2 - sy1) ? (sx2 >= sx1 ? 'r' : 'l') : (sy2 >= sy1 ? 'd' : 'u'),
    });
  }
  return out;
}

/** The page's text as one string, with the start of each piece in it. */
export function joinPieces(pieces) {
  let text = '';
  const starts = [];
  pieces.forEach((p, i) => {
    if (i > 0 && text && !/\s$/.test(text) && (pieces[i - 1].eol || !/^\s/.test(p.str))) text += pieces[i - 1].eol ? '\n' : ' ';
    starts.push(text.length);
    text += p.str;
  });
  return { text, starts };
}

const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Part of a piece's box, from character `from` to `to`. */
function partBox(piece, from, to) {
  const n = Math.max(1, piece.str.length);
  const a = Math.max(0, from) / n;
  const b = Math.min(n, to) / n;
  const { x, y, w, h } = piece.box;
  if (piece.dir === 'r') return { x: x + w * a, y, w: w * (b - a), h };
  if (piece.dir === 'l') return { x: x + w * (1 - b), y, w: w * (b - a), h };
  if (piece.dir === 'd') return { x, y: y + h * a, w, h: h * (b - a) };
  return { x, y: y + h * (1 - b), w, h: h * (b - a) };
}

/**
 * Every place `query` appears on a page (any case, any spacing):
 * [{ start, boxes: [{ x, y, w, h }] }] in reading order.
 */
export function findInPieces(pieces, query) {
  const q = squash(query).toLowerCase();
  if (!q || !pieces?.length) return [];
  const { text, starts } = joinPieces(pieces);
  // Search a squashed copy, remembering where each squashed letter came from.
  const map = [];
  let flat = '';
  for (let i = 0; i < text.length; i += 1) {
    const space = /\s/.test(text[i]);
    if (space && (flat.endsWith(' ') || !flat)) continue;
    flat += space ? ' ' : text[i].toLowerCase();
    map.push(i);
  }
  const hits = [];
  for (let at = flat.indexOf(q); at !== -1; at = flat.indexOf(q, at + q.length)) {
    const s = map[at];
    const e = map[at + q.length - 1] + 1;
    const boxes = [];
    pieces.forEach((p, i) => {
      const ps = starts[i];
      const pe = ps + p.str.length;
      if (pe <= s || ps >= e) return;
      const box = partBox(p, s - ps, e - ps);
      if (box.w > 0 && box.h > 0) boxes.push(box);
    });
    hits.push({ start: s, boxes });
  }
  return hits;
}

/** A line of text around a hit, for the results list. */
export function snippetAt(text, start, length, room = 40) {
  const from = Math.max(0, start - room);
  const to = Math.min(text.length, start + length + room);
  return `${from > 0 ? '…' : ''}${squash(text.slice(from, to))}${to < text.length ? '…' : ''}`;
}

/** A PDF-space box [x1, y1, x2, y2] through a pdf.js viewport. */
export function viewRect(viewport, [x1, y1, x2, y2]) {
  const [a, b] = viewport.convertToViewportPoint(x1, y1);
  const [c, d] = viewport.convertToViewportPoint(x2, y2);
  return [a, b, c, d];
}

/** The text pieces of a pdf.js page, boxed on the page turned to `rotation`. */
export async function piecesOfPage(page, rotation = 0) {
  const viewport = page.getViewport({ scale: 1, rotation });
  const content = await page.getTextContent();
  return textPieces(content.items, (r) => viewRect(viewport, r));
}

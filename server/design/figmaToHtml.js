// Figma node tree -> standalone HTML/CSS.
//
// The output is plain code on purpose: once a frame is on the canvas, any
// model (not just Figma's) can read and rewrite it. Every layer becomes an
// absolutely positioned element at its Figma coordinates, so the first render
// matches the design pixel for pixel; layer names ride along as data-name so
// a model can find "Header" or "CTA button" when asked to change it.
//
// Known gaps, kept honest: rotation is ignored (bounds are used as-is),
// auto-layout is flattened to absolute positions, and vector shapes only keep
// their exact outline when an SVG render for them was supplied.

import {
  colorToCss,
  cornerRadius,
  effectStyles,
  firstSolid,
  paintToBackgroundLayer,
  round,
  strokeShadow,
  textStyles,
} from './figmaStyles.js';

export { colorToCss, paintToBackgroundLayer };

export const MAX_DESIGN_HTML_BYTES = 400 * 1024;
const MAX_NODES = 4000;

const VECTOR_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'POLYGON', 'REGULAR_POLYGON']);
const SKIP_TYPES = new Set(['SLICE', 'STICKY', 'CONNECTOR', 'WIDGET', 'EMBED', 'LINK_UNFURL', 'STAMP']);

export function isVectorNode(node) {
  return VECTOR_TYPES.has(node?.type);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function styleString(style) {
  return Object.entries(style)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ')
    // Attribute-safe: quotes inside font names and url()s become &quot;.
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

/** Every vector-ish node id in the tree, for one batched SVG render call. */
export function collectVectorIds(root, limit = 80) {
  const ids = [];
  const walk = (node) => {
    if (!node || node.visible === false || ids.length >= limit) return;
    if (isVectorNode(node)) { ids.push(node.id); return; }
    (node.children || []).forEach(walk);
  };
  walk(root);
  return ids;
}

/** Whether any layer paints an image fill (so the image-fill map is needed). */
export function hasImageFills(root) {
  let found = false;
  const walk = (node) => {
    if (found || !node || node.visible === false) return;
    if ((node.fills || []).some(p => p?.type === 'IMAGE' && p.visible !== false)) { found = true; return; }
    (node.children || []).forEach(walk);
  };
  walk(root);
  return found;
}

/**
 * Convert one Figma frame (a node from GET /files/:key/nodes) into a
 * standalone HTML document.
 *
 * @param {object} root            Figma node (FRAME, COMPONENT, GROUP, ...)
 * @param {object} assets
 * @param {object} assets.imageUrls  imageRef -> URL (GET /files/:key/images)
 * @param {object} assets.svgUrls    node id -> SVG render URL (GET /images?format=svg)
 */
export function figmaNodeToHtml(root, { imageUrls = {}, svgUrls = {} } = {}) {
  if (!root || !root.absoluteBoundingBox) {
    throw Object.assign(new Error('That Figma layer has no size to render.'), { statusCode: 422, code: 'FIGMA_NODE_EMPTY' });
  }
  const fonts = new Map();
  const stats = { nodes: 0, vectors: 0, images: 0, text: 0 };
  const origin = root.absoluteBoundingBox;

  const render = (node, parentBox, isRoot, depth) => {
    if (!node || node.visible === false || SKIP_TYPES.has(node.type)) return '';
    if (stats.nodes >= MAX_NODES) return '';
    const box = node.absoluteBoundingBox;
    if (!box) return '';
    stats.nodes += 1;

    const style = {
      position: isRoot ? 'relative' : 'absolute',
      left: isRoot ? undefined : `${round(box.x - parentBox.x)}px`,
      top: isRoot ? undefined : `${round(box.y - parentBox.y)}px`,
      width: `${round(box.width)}px`,
      height: `${round(box.height)}px`,
    };
    if (node.opacity !== undefined && node.opacity < 1) style.opacity = String(round(node.opacity));
    if (node.blendMode && !['PASS_THROUGH', 'NORMAL'].includes(node.blendMode)) {
      style['mix-blend-mode'] = node.blendMode.toLowerCase().replace(/_/g, '-');
    }
    const name = escapeHtml(node.name || node.type);
    const indent = '  '.repeat(depth + 1);

    if (isVectorNode(node)) {
      stats.vectors += 1;
      const svg = svgUrls[node.id];
      if (svg) {
        return `${indent}<img data-name="${name}" alt="" src="${escapeHtml(svg)}" style="${styleString({ ...style, display: 'block' })}">\n`;
      }
      const fill = firstSolid(node.fills) || firstSolid(node.strokes);
      if (fill) style.background = colorToCss(fill.color, fill.opacity);
      return `${indent}<div data-name="${name}" style="${styleString(style)}"></div>\n`;
    }

    if (node.type === 'TEXT') {
      stats.text += 1;
      textStyles(node, style, fonts);
      const text = escapeHtml(node.characters || '').replace(/\n/g, '<br>');
      return `${indent}<div data-name="${name}" style="${styleString(style)}">${text}</div>\n`;
    }

    const layers = (node.fills || [])
      .map(p => {
        if (p?.type === 'IMAGE' && p.visible !== false) stats.images += 1;
        return paintToBackgroundLayer(p, imageUrls);
      })
      .filter(Boolean)
      .reverse(); // Figma lists fills bottom-first; CSS lists layers top-first.
    if (layers.length) style.background = layers.join(', ');
    const radius = cornerRadius(node);
    if (radius) style['border-radius'] = radius;
    const shadows = effectStyles(node, style);
    const stroke = strokeShadow(node);
    if (stroke) shadows.unshift(stroke);
    if (shadows.length) style['box-shadow'] = shadows.join(', ');
    if (node.clipsContent) style.overflow = 'hidden';

    const children = (node.children || []).map(child => render(child, box, false, depth + 1)).join('');
    const tag = isRoot ? 'main' : 'div';
    return children
      ? `${indent}<${tag} data-name="${name}" style="${styleString(style)}">\n${children}${indent}</${tag}>\n`
      : `${indent}<${tag} data-name="${name}" style="${styleString(style)}"></${tag}>\n`;
  };

  const body = render(root, origin, true, 0);
  const fontLink = fonts.size
    ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${[...fonts.entries()]
      .map(([family, weights]) => `family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${[...weights].sort((a, b) => a - b).join(';')}`)
      .join('&')}&display=swap">\n`
    : '';
  const title = escapeHtml(root.name || 'Figma frame');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${round(origin.width)}">
<title>${title}</title>
${fontLink}<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  * { box-sizing: border-box; }
</style>
</head>
<body>
${body}</body>
</html>
`;
  if (Buffer.byteLength(html, 'utf8') > MAX_DESIGN_HTML_BYTES) {
    throw Object.assign(
      new Error('That frame is too detailed to bring in as code. Pick a smaller frame or section.'),
      { statusCode: 413, code: 'FIGMA_FRAME_TOO_LARGE' },
    );
  }
  return {
    html,
    width: round(origin.width),
    height: round(origin.height),
    fonts: [...fonts.keys()],
    stats,
  };
}

// Figma paint, effect and type properties -> CSS declarations.
// Used by figmaToHtml.js, which walks the layer tree.

export const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function colorToCss(color = {}, opacity = 1) {
  const r = Math.round((color.r ?? 0) * 255);
  const g = Math.round((color.g ?? 0) * 255);
  const b = Math.round((color.b ?? 0) * 255);
  const a = round((color.a ?? 1) * (opacity ?? 1));
  return a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
}

function escapeCssUrl(url) {
  return String(url).replace(/["\\\n\r]/g, '');
}

function gradientStops(paint) {
  return (paint.gradientStops || [])
    .map(stop => `${colorToCss(stop.color, paint.opacity)} ${round(stop.position * 100)}%`)
    .join(', ');
}

function linearAngle(paint) {
  const [start, end] = paint.gradientHandlePositions || [];
  if (!start || !end) return 180;
  const deg = Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI);
  return round(deg + 90);
}

/** One Figma paint -> one CSS background layer (or null when not drawable). */
export function paintToBackgroundLayer(paint, imageUrls = {}) {
  if (!paint || paint.visible === false) return null;
  switch (paint.type) {
    case 'SOLID': {
      const c = colorToCss(paint.color, paint.opacity);
      return `linear-gradient(${c}, ${c})`;
    }
    case 'GRADIENT_LINEAR':
      return `linear-gradient(${linearAngle(paint)}deg, ${gradientStops(paint)})`;
    case 'GRADIENT_RADIAL':
    case 'GRADIENT_DIAMOND':
      return `radial-gradient(circle, ${gradientStops(paint)})`;
    case 'GRADIENT_ANGULAR':
      return `conic-gradient(${gradientStops(paint)})`;
    case 'IMAGE': {
      const url = imageUrls[paint.imageRef];
      if (!url) return null;
      const size = paint.scaleMode === 'FIT' ? 'contain' : paint.scaleMode === 'TILE' ? 'auto' : 'cover';
      const repeat = paint.scaleMode === 'TILE' ? 'repeat' : 'no-repeat';
      return `url("${escapeCssUrl(url)}") center / ${size} ${repeat}`;
    }
    default:
      return null;
  }
}

export function firstSolid(paints = []) {
  return paints.find(p => p && p.visible !== false && p.type === 'SOLID') || null;
}

export function cornerRadius(node) {
  if (node.type === 'ELLIPSE') return '50%';
  if (Array.isArray(node.rectangleCornerRadii)) {
    const [tl, tr, br, bl] = node.rectangleCornerRadii.map(round);
    if (tl || tr || br || bl) return `${tl}px ${tr}px ${br}px ${bl}px`;
  }
  if (node.cornerRadius) return `${round(node.cornerRadius)}px`;
  return null;
}

export function effectStyles(node, style) {
  const shadows = [];
  for (const effect of node.effects || []) {
    if (effect.visible === false) continue;
    if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
      const o = effect.offset || {};
      shadows.push(`${effect.type === 'INNER_SHADOW' ? 'inset ' : ''}${round(o.x)}px ${round(o.y)}px ${round(effect.radius)}px ${round(effect.spread)}px ${colorToCss(effect.color)}`);
    } else if (effect.type === 'LAYER_BLUR') {
      style.filter = `blur(${round(effect.radius / 2)}px)`;
    } else if (effect.type === 'BACKGROUND_BLUR') {
      style['backdrop-filter'] = `blur(${round(effect.radius / 2)}px)`;
    }
  }
  return shadows;
}

export function strokeShadow(node) {
  const stroke = firstSolid(node.strokes);
  const weight = Number(node.strokeWeight) || 0;
  if (!stroke || weight <= 0 || node.type === 'TEXT') return null;
  const color = colorToCss(stroke.color, stroke.opacity);
  // Strokes never change layout in Figma, so draw them as shadows rather
  // than borders: inside, outside, or straddling the edge.
  if (node.strokeAlign === 'OUTSIDE') return `0 0 0 ${round(weight)}px ${color}`;
  if (node.strokeAlign === 'CENTER') return `inset 0 0 0 ${round(weight / 2)}px ${color}, 0 0 0 ${round(weight / 2)}px ${color}`;
  return `inset 0 0 0 ${round(weight)}px ${color}`;
}

const TEXT_ALIGN = { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' };
const V_ALIGN = { TOP: 'flex-start', CENTER: 'center', BOTTOM: 'flex-end' };
const TEXT_CASE = { UPPER: 'uppercase', LOWER: 'lowercase', TITLE: 'capitalize' };

export function textStyles(node, style, fonts) {
  const s = node.style || {};
  const fill = firstSolid(node.fills);
  if (fill) style.color = colorToCss(fill.color, fill.opacity);
  if (s.fontFamily) {
    style['font-family'] = `"${String(s.fontFamily).replace(/"/g, '')}", system-ui, sans-serif`;
    const weights = fonts.get(s.fontFamily) || new Set();
    weights.add(Number(s.fontWeight) || 400);
    fonts.set(s.fontFamily, weights);
  }
  if (s.fontWeight) style['font-weight'] = String(s.fontWeight);
  if (s.fontSize) style['font-size'] = `${round(s.fontSize)}px`;
  if (s.italic) style['font-style'] = 'italic';
  if (s.lineHeightPx) style['line-height'] = `${round(s.lineHeightPx)}px`;
  if (s.letterSpacing) style['letter-spacing'] = `${round(s.letterSpacing)}px`;
  if (TEXT_ALIGN[s.textAlignHorizontal]) style['text-align'] = TEXT_ALIGN[s.textAlignHorizontal];
  if (TEXT_CASE[s.textCase]) style['text-transform'] = TEXT_CASE[s.textCase];
  if (s.textDecoration === 'UNDERLINE') style['text-decoration'] = 'underline';
  if (s.textDecoration === 'STRIKETHROUGH') style['text-decoration'] = 'line-through';
  style.display = 'flex';
  style['flex-direction'] = 'column';
  style['justify-content'] = V_ALIGN[s.textAlignVertical] || 'flex-start';
  // Auto-width text never wraps in Figma; keep it on one line here too so a
  // fallback font that runs slightly wider does not push words down a line.
  style['white-space'] = s.textAutoResize === 'WIDTH_AND_HEIGHT' ? 'pre' : 'pre-wrap';
  style['overflow-wrap'] = 'break-word';
  style.margin = '0';
}

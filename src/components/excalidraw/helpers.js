export const COLORS = [
  { value: 'var(--ink)', label: 'Ink' },
  { value: 'var(--accent)', label: 'Accent' },
  { value: '#f43f5e', label: 'Red' },
  { value: '#10b981', label: 'Green' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#f97316', label: 'Orange' },
  { value: '#a855f7', label: 'Purple' },
];

export const STROKE_WIDTHS = [
  { value: 1.5, label: 'Thin' },
  { value: 3, label: 'Med' },
  { value: 6, label: 'Thick' },
  { value: 10, label: 'Huge' },
];

export const getBoundingBox = (el) => {
  if (el.type === 'pencil' || el.type === 'arrow') {
    if (!el.pts || el.pts.length === 0) return { x: el.x, y: el.y, w: 0, h: 0 };
    const xs = el.pts.map(p => p.x);
    const ys = el.pts.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  return { x: el.x, y: el.y, w: el.w, h: el.h };
};

export const getSvgPath = (pts) => {
  if (!pts || pts.length === 0) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i].x} ${pts[i].y}`;
  }
  return d;
};

export const btnStyle = {
  all: 'unset',
  width: 24,
  height: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
  transition: 'all 0.15s ease',
};

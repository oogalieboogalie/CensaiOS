// Plain math for the 3D Viewer: where each model sits, its size, how many
// triangles it has and how a measured distance reads. No three.js here, so
// tests can run it directly.

/**
 * Where each model goes, from its box ({ min: [x,y,z], max: [x,y,z] }, after
 * it is stood up). "side": a row along X with a small gap, each standing on
 * the floor and centred front to back. "asMade": every model keeps its place
 * relative to the others (parts of one assembly), the whole set moved onto
 * the floor at the middle. Returns one [x,y,z] offset per box.
 */
export function arrangeOffsets(boxes, arrange = 'side') {
  const real = boxes.map((b) => b && Number.isFinite(b.min?.[0]) && Number.isFinite(b.max?.[0]));
  if (arrange === 'asMade') {
    const live = boxes.filter((_, i) => real[i]);
    if (!live.length) return boxes.map(() => [0, 0, 0]);
    const min = [0, 1, 2].map((k) => Math.min(...live.map((b) => b.min[k])));
    const max = [0, 1, 2].map((k) => Math.max(...live.map((b) => b.max[k])));
    const off = [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2];
    return boxes.map(() => off);
  }
  const widths = boxes.map((b, i) => (real[i] ? b.max[0] - b.min[0] : 0));
  const biggest = Math.max(0, ...boxes.map((b, i) => (real[i] ? Math.max(...[0, 1, 2].map((k) => b.max[k] - b.min[k])) : 0)));
  const gap = biggest * 0.15;
  const total = widths.reduce((s, w) => s + w, 0) + gap * Math.max(0, widths.filter(Boolean).length - 1);
  let x = -total / 2;
  return boxes.map((b, i) => {
    if (!real[i]) return [0, 0, 0];
    const off = [x - b.min[0], -b.min[1], -(b.min[2] + b.max[2]) / 2];
    x += widths[i] + gap;
    return off;
  });
}

/** A number with sensible digits for its size: 1234 -> "1,234", 12.345 -> "12.3", 0.01234 -> "0.0123". */
export function niceNumber(v) {
  const a = Math.abs(v);
  if (!Number.isFinite(v)) return '–';
  if (a === 0) return '0';
  const digits = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : Math.min(6, 2 - Math.floor(Math.log10(a)));
  return Number(v.toFixed(digits)).toLocaleString('en-US', { maximumFractionDigits: digits });
}

/** "120 × 80 × 45" from a box (width × depth × height, Y being height). */
export function sizeText(box) {
  if (!box) return '';
  const w = box.max[0] - box.min[0];
  const h = box.max[1] - box.min[1];
  const d = box.max[2] - box.min[2];
  return `${niceNumber(w)} × ${niceNumber(d)} × ${niceNumber(h)}`;
}

/** A box as it stands once a Z-up model is turned to Y-up (the turn the viewer applies). */
export function standBox(box, zUp) {
  if (!box || !zUp) return box;
  return { min: [box.min[0], box.min[2], -box.max[1]], max: [box.max[0], box.max[2], -box.min[1]] };
}

export function distance(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

/**
 * Length between two clicked points ({ id, local, world }). On one model it
 * is measured in that model's own file units, so "Same size" scaling never
 * changes the answer; across two models it falls back to the scene.
 */
export function measureLength(a, b) {
  if (!a || !b) return null;
  if (a.id === b.id && a.local && b.local) return distance(a.local, b.local);
  const w = (p) => (Array.isArray(p.world) ? p.world : p.world.toArray());
  return distance(w(a), w(b));
}

/** How much to scale a model so its biggest side is `target` ("Same size"). */
export function sameSizeScale(box, target = 1) {
  if (!box) return 1;
  const biggest = Math.max(...[0, 1, 2].map((k) => box.max[k] - box.min[k]));
  return biggest > 0 ? target / biggest : 1;
}

/**
 * Count what a three.js object holds. Duck-typed: walks `children` and reads
 * `geometry.index` / `geometry.attributes.position` like three.js does.
 */
export function countObject(root) {
  const out = { meshes: 0, triangles: 0, vertices: 0, points: 0, materials: 0 };
  const mats = new Set();
  const walk = (o) => {
    const g = o.geometry;
    const pos = g?.attributes?.position;
    if (pos) {
      if (o.isPoints) out.points += pos.count;
      else if (o.isMesh) {
        out.meshes += 1;
        out.vertices += pos.count;
        out.triangles += Math.floor((g.index ? g.index.count : pos.count) / 3);
      }
      for (const m of [].concat(o.material || [])) mats.add(m);
    }
    for (const c of o.children || []) walk(c);
  };
  if (root) walk(root);
  out.materials = mats.size;
  return out;
}

/** "12,480 triangles · 3 parts" for the info panel. */
export function statsLine(stats) {
  if (!stats) return '';
  const parts = [];
  if (stats.triangles) parts.push(`${stats.triangles.toLocaleString('en-US')} triangles`);
  if (stats.points) parts.push(`${stats.points.toLocaleString('en-US')} points`);
  if (stats.meshes > 1) parts.push(`${stats.meshes} parts`);
  return parts.join(' · ');
}

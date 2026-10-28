// Whether a mesh is ready to print: size in the geometry's own units
// (one unit is one millimetre; X width, Y depth, Z height, Z up), how many
// triangles, and whether every edge belongs to exactly two triangles.
// Vertices closer than a tiny tolerance count as the same point, so a box
// whose corners are stored once per face still reads as closed.

const EMPTY = { size: { x: 0, y: 0, z: 0 }, triangles: 0, openEdges: 0, closed: false };

function coord(attr, i, axis) {
  if (typeof attr.getX === 'function') return axis === 0 ? attr.getX(i) : axis === 1 ? attr.getY(i) : attr.getZ(i);
  const arr = attr.array || attr;
  return arr[i * 3 + axis];
}

function indexAt(index, slot) {
  if (!index) return slot;
  if (typeof index.getX === 'function') return index.getX(slot);
  const arr = index.array || index;
  return arr[slot];
}

function weldId(buckets, placed, point, tol) {
  const [x, y, z] = point;
  const qx = Math.round(x / tol);
  const qy = Math.round(y / tol);
  const qz = Math.round(z / tol);
  const tol2 = tol * tol;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = buckets.get(`${qx + dx},${qy + dy},${qz + dz}`);
        if (!bucket) continue;
        for (const id of bucket) {
          const p = placed[id];
          const d = (p[0] - x) ** 2 + (p[1] - y) ** 2 + (p[2] - z) ** 2;
          if (d <= tol2) return id;
        }
      }
    }
  }
  const id = placed.length;
  placed.push(point);
  const key = `${qx},${qy},${qz}`;
  const bucket = buckets.get(key);
  if (bucket) bucket.push(id);
  else buckets.set(key, [id]);
  return id;
}

/**
 * @param {object} geometry three.js BufferGeometry, indexed or not
 * @returns {{ size: {x:number,y:number,z:number}, triangles: number, openEdges: number, closed: boolean }}
 */
export function printCheck(geometry) {
  const pos = geometry?.getAttribute?.('position') || geometry?.attributes?.position;
  if (!pos || !(pos.count > 0)) return EMPTY;
  const index = geometry.index || null;
  const slots = index ? index.count : pos.count;
  const declared = Math.floor(slots / 3);
  if (!declared) return EMPTY;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const corners = [];
  for (let t = 0; t < declared; t++) {
    const tri = [];
    let finite = true;
    for (let k = 0; k < 3; k++) {
      const vi = indexAt(index, t * 3 + k);
      const p = [coord(pos, vi, 0), coord(pos, vi, 1), coord(pos, vi, 2)];
      if (!p.every(Number.isFinite)) finite = false;
      tri.push({ vi, p });
    }
    if (!finite) continue;
    for (const { p } of tri) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[2] < minZ) minZ = p[2];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
      if (p[2] > maxZ) maxZ = p[2];
    }
    corners.push(tri);
  }
  if (!corners.length) return EMPTY;

  const size = { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
  const span = Math.max(size.x, size.y, size.z, 1);
  const tol = Math.max(1e-4, span * 1e-6);
  const buckets = new Map();
  const placed = [];
  const byVertex = new Map();
  const edges = new Map();
  const touch = (a, b) => {
    if (a === b) return;
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    edges.set(key, (edges.get(key) || 0) + 1);
  };
  for (const tri of corners) {
    const ids = tri.map(({ vi, p }) => {
      const known = byVertex.get(vi);
      if (known !== undefined) return known;
      const id = weldId(buckets, placed, p, tol);
      byVertex.set(vi, id);
      return id;
    });
    if (ids[0] === ids[1] || ids[1] === ids[2] || ids[0] === ids[2]) continue;
    touch(ids[0], ids[1]);
    touch(ids[1], ids[2]);
    touch(ids[0], ids[2]);
  }
  let openEdges = 0;
  for (const count of edges.values()) if (count !== 2) openEdges += 1;
  const triangles = corners.length;
  return {
    size,
    triangles,
    openEdges,
    closed: triangles > 0 && edges.size > 0 && openEdges === 0,
  };
}

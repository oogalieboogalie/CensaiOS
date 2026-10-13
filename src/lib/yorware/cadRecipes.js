// Ready-made parts for a new YorWare CAD window. Each is a real recipe: the
// sizes are dials in the window, and the code is there to read and change
// (by a person or an agent). Units are millimetres.

const blank = `// A part is a recipe. Change a size on the right, or the code here.
// r is the replicad library (https://replicad.xyz/docs); sizes are in mm.
const params = {
  width: { value: 40, min: 5, max: 300, label: 'Width' },
  depth: { value: 30, min: 5, max: 300, label: 'Depth' },
  height: { value: 20, min: 1, max: 300, label: 'Height' },
  corner: { value: 3, min: 0, max: 20, label: 'Corner round' },
};

function main(r, p) {
  const outline = p.corner > 0
    ? r.drawRoundedRectangle(p.width, p.depth, Math.min(p.corner, p.width / 2 - 0.1, p.depth / 2 - 0.1))
    : r.drawRectangle(p.width, p.depth);
  return outline.sketchOnPlane('XY').extrude(p.height);
}
`;

const bracket = `// An L-shaped mounting bracket with screw holes in both legs.
const params = {
  width: { value: 40, min: 15, max: 200, label: 'Width' },
  leg: { value: 50, min: 15, max: 200, label: 'Leg length' },
  thickness: { value: 4, min: 1.5, max: 15, step: 0.5, label: 'Thickness' },
  hole: { value: 4.5, min: 2, max: 12, step: 0.5, label: 'Hole size' },
  holes: { value: 2, min: 1, max: 4, unit: '', label: 'Holes per leg' },
  bend: { value: 3, min: 0, max: 12, step: 0.5, label: 'Inside round' },
};

function main(r, p) {
  const t = p.thickness;
  // The L profile, drawn from the side, then pushed out to the width.
  const profile = r.draw([0, 0]).hLine(p.leg).vLine(t).hLine(-(p.leg - t)).vLine(p.leg - t).hLine(-t).close();
  let part = profile.sketchOnPlane('XZ').extrude(-p.width);
  if (p.bend > 0) part = part.fillet(Math.min(p.bend, p.leg - t - 1), (e) => e.inDirection('Y').containsPoint([t, p.width / 2, t]));
  const gap = p.width / (p.holes + 1);
  for (let i = 1; i <= p.holes; i += 1) {
    const y = i * gap;
    const reach = (p.leg + t) / 2;
    part = part.cut(r.makeCylinder(p.hole / 2, t * 3, [reach, y, -t], [0, 0, 1]));
    part = part.cut(r.makeCylinder(p.hole / 2, t * 3, [-t, y, reach], [1, 0, 0]));
  }
  return { shape: part, name: 'Bracket', color: '#9aa7b4' };
}
`;

const phoneStand = `// A desk stand: the phone leans back on a slanted plate, its bottom held by a lip.
const params = {
  width: { value: 70, min: 40, max: 200, label: 'Width' },
  angle: { value: 65, min: 45, max: 80, unit: '°', label: 'Lean angle' },
  device: { value: 11, min: 6, max: 25, step: 0.5, label: 'Device thickness' },
  thickness: { value: 4, min: 2.5, max: 8, step: 0.5, label: 'Wall' },
  cable: { value: true, label: 'Charging slot' },
};

function main(r, p) {
  const t = p.thickness;
  const a = (p.angle * Math.PI) / 180;
  const along = [Math.cos(a), Math.sin(a)];
  // A plate of thickness t from point A to point B, seen from the side.
  const slab = (A, B) => {
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const n = [-(B[1] - A[1]) / len * t, (B[0] - A[0]) / len * t];
    return r.draw(A).lineTo(B).lineTo([B[0] - n[0], B[1] - n[1]]).lineTo([A[0] - n[0], A[1] - n[1]]).close()
      .sketchOnPlane('XZ').extrude(-p.width);
  };
  const foot = [t + p.device + t * Math.sin(a), 0];
  const top = [foot[0] + 95 * along[0], 95 * along[1]];
  const knee = [foot[0] + 55 * along[0], 55 * along[1]];
  const back = top[0] + 12;
  let stand = r.makeBox([0, 0, 0], [back, p.width, t])
    .fuse(r.makeBox([0, 0, 0], [t, p.width, 14]))
    .fuse(slab(foot, top))
    .fuse(slab([back, 0], knee));
  if (p.cable) stand = stand.cut(r.makeBox([-1, p.width / 2 - 6, t], [t + 1, p.width / 2 + 6, 20]));
  return { shape: stand, name: 'Phone stand', color: '#e5a83a' };
}
`;

const projectBox = `// A box for electronics with a lid that sits on top. Two bodies.
const params = {
  length: { value: 80, min: 20, max: 250, label: 'Length' },
  width: { value: 50, min: 20, max: 250, label: 'Width' },
  height: { value: 30, min: 10, max: 150, label: 'Height' },
  wall: { value: 2, min: 1, max: 6, step: 0.2, label: 'Wall' },
  corner: { value: 5, min: 1, max: 20, label: 'Corner round' },
  posts: { value: true, label: 'Screw posts' },
};

function main(r, p) {
  // The inside of the wall needs a little round of its own, so the corner stays above the wall.
  const c = Math.min(Math.max(p.corner, p.wall + 0.5), p.length / 2 - p.wall - 0.5, p.width / 2 - p.wall - 0.5);
  const rounded = (l, w, rad) => (rad > 0.3 ? r.drawRoundedRectangle(l, w, rad) : r.drawRectangle(l, w));
  let box = rounded(p.length, p.width, c).sketchOnPlane('XY').extrude(p.height).shell(p.wall, (f) => f.inPlane('XY', p.height));
  if (p.posts) {
    const dx = p.length / 2 - p.wall - 4;
    const dy = p.width / 2 - p.wall - 4;
    for (const [x, y] of [[dx, dy], [-dx, dy], [dx, -dy], [-dx, -dy]]) {
      const post = r.makeCylinder(3.5, p.height - p.wall - 2, [x, y, p.wall]).cut(r.makeCylinder(1.25, p.height, [x, y, p.wall]));
      box = box.fuse(post);
    }
  }
  // The lid floats above the box; its lip fits just inside the walls.
  const top = p.height + 6;
  const lipL = p.length - 2 * p.wall - 0.4;
  const lipW = p.width - 2 * p.wall - 0.4;
  const lipR = c - p.wall - 0.2;
  const lip = rounded(lipL, lipW, lipR).sketchOnPlane('XY', top - 3).extrude(3)
    .cut(rounded(lipL - 2.4, lipW - 2.4, lipR - 1.2).sketchOnPlane('XY', top - 4).extrude(5));
  const lid = rounded(p.length, p.width, c).sketchOnPlane('XY', top).extrude(p.wall).fuse(lip);
  return [
    { shape: box, name: 'Box', color: '#6f9ec9' },
    { shape: lid, name: 'Lid', color: '#9aa7b4' },
  ];
}
`;

const knob = `// A round knob with finger grips and a D-shaped shaft hole.
const params = {
  diameter: { value: 30, min: 12, max: 80, label: 'Diameter' },
  height: { value: 16, min: 6, max: 40, label: 'Height' },
  grips: { value: 12, min: 0, max: 30, unit: '', label: 'Finger grips' },
  shaft: { value: 6, min: 2, max: 12, step: 0.1, label: 'Shaft size' },
  flat: { value: true, label: 'Flat on the shaft' },
};

function main(r, p) {
  const R = p.diameter / 2;
  let part = r.makeCylinder(R, p.height).fillet(Math.min(2, p.height / 4), (e) => e.inPlane('XY', p.height));
  for (let i = 0; i < p.grips; i += 1) {
    const a = (i / p.grips) * Math.PI * 2;
    part = part.cut(r.makeCylinder(R * 0.12, p.height * 3, [Math.cos(a) * R * 1.03, Math.sin(a) * R * 1.03, -p.height]));
  }
  let hole = r.makeCylinder(p.shaft / 2, p.height * 0.75, [0, 0, -1]);
  if (p.flat) hole = hole.cut(r.makeBox([p.shaft * 0.3, -p.shaft, -2], [p.shaft, p.shaft, p.height]));
  return { shape: part.cut(hole), name: 'Knob', color: '#3b3f46' };
}
`;

const flange = `// A pipe flange: a ring with a raised neck and a circle of bolt holes.
const params = {
  outer: { value: 120, min: 40, max: 400, label: 'Outer diameter' },
  bore: { value: 50, min: 10, max: 300, label: 'Bore' },
  thickness: { value: 12, min: 3, max: 40, label: 'Thickness' },
  bolts: { value: 6, min: 3, max: 16, unit: '', label: 'Bolt holes' },
  bolt: { value: 10, min: 3, max: 30, step: 0.5, label: 'Bolt hole size' },
  neck: { value: 15, min: 0, max: 60, label: 'Neck height' },
};

function main(r, p) {
  const bore = Math.min(p.bore, p.outer - 20);
  const neckR = bore / 2 + Math.max(4, (p.outer - bore) / 8);
  let part = r.makeCylinder(p.outer / 2, p.thickness);
  if (p.neck > 0) part = part.fuse(r.makeCylinder(neckR, p.thickness + p.neck));
  part = part.cut(r.makeCylinder(bore / 2, p.thickness + p.neck + 2, [0, 0, -1]));
  const ring = (p.outer / 2 + neckR) / 2;
  for (let i = 0; i < p.bolts; i += 1) {
    const a = (i / p.bolts) * Math.PI * 2;
    part = part.cut(r.makeCylinder(p.bolt / 2, p.thickness + 2, [Math.cos(a) * ring, Math.sin(a) * ring, -1]));
  }
  return { shape: part, name: 'Flange', color: '#c98a6f' };
}
`;

export const CAD_RECIPES = Object.freeze([
  { id: 'blank', label: 'Rounded block', hint: 'A starting block to change or write over', code: blank },
  { id: 'bracket', label: 'Mounting bracket', hint: 'L bracket with screw holes', code: bracket },
  { id: 'phoneStand', label: 'Phone stand', hint: 'Leans a phone or tablet on the desk', code: phoneStand },
  { id: 'projectBox', label: 'Project box', hint: 'Electronics box and lid, with screw posts', code: projectBox },
  { id: 'knob', label: 'Knob', hint: 'Finger grips and a D-shaped shaft hole', code: knob },
  { id: 'flange', label: 'Pipe flange', hint: 'Bolt circle, bore and neck', code: flange },
]);

export const recipeById = (id) => CAD_RECIPES.find((x) => x.id === id) || null;

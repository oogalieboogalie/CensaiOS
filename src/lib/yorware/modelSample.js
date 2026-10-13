// Two small sample models made on the spot (no download): a toy rocket and
// a gear, saved as .glb files like any model someone opens, so the viewer
// can be tried without a file at hand.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { bytesToBase64 } from './pdfBytes.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1, ...extra });

function rocket() {
  const g = new THREE.Group();
  const outline = [[0, 0], [0.42, 0], [0.5, 0.25], [0.52, 1.1], [0.46, 1.6], [0.3, 2.0], [0.1, 2.25], [0, 2.3]];
  const body = new THREE.Mesh(new THREE.LatheGeometry(outline.map(([x, y]) => new THREE.Vector2(x, y)), 48), mat(0xf2f0ea));
  body.name = 'Body';
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.535, 0.535, 0.16, 48), mat(0xe5a83a, { metalness: 0.4 }));
  band.position.y = 1.05;
  band.name = 'Band';
  const glass = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 12, 32), mat(0x2b2b2b));
  glass.position.set(0, 1.45, 0.5);
  glass.rotation.x = -0.12;
  const pane = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), mat(0x6fa8dc, { roughness: 0.1, metalness: 0.6 }));
  pane.position.set(0, 1.45, 0.495);
  pane.rotation.x = -0.12;
  pane.name = 'Window';
  const fin = new THREE.Shape([[0, 0], [0.5, -0.25], [0.5, 0.15], [0, 0.75]].map(([x, y]) => new THREE.Vector2(x, y)));
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.06, bevelEnabled: false });
  finGeo.translate(0.42, 0.2, -0.03);
  for (let i = 0; i < 3; i += 1) {
    const f = new THREE.Mesh(finGeo, mat(0xe5a83a, { metalness: 0.4 }));
    f.rotation.y = (i * Math.PI * 2) / 3;
    f.name = `Fin ${i + 1}`;
    g.add(f);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 32), mat(0xff7a2f, { emissive: 0xff5a1f, emissiveIntensity: 0.6 }));
  flame.rotation.x = Math.PI;
  flame.position.y = -0.25;
  flame.name = 'Flame';
  g.add(body, band, glass, pane, flame);
  return g;
}

function gear() {
  const teeth = 18;
  const outer = 1;
  const inner = 0.84;
  const shape = new THREE.Shape();
  for (let i = 0; i < teeth * 4; i += 1) {
    const a = (i / (teeth * 4)) * Math.PI * 2;
    const r = i % 4 === 1 || i % 4 === 2 ? outer : inner;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.22, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 24 });
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat(0x6b6f76, { metalness: 0.8, roughness: 0.3 }));
  m.name = 'Gear';
  return m;
}

function toGlb(object) {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(object, (out) => resolve(new Uint8Array(out)), reject, { binary: true });
  });
}

/** Board-ready items, the same shape readModel gives for a dropped file. */
export async function sampleModels() {
  const out = [];
  for (const [name, make] of [['Toy rocket', rocket], ['Gear', gear]]) {
    const bytes = await toGlb(make());
    const main = `${name.toLowerCase().replace(/\s+/g, '-')}.glb`;
    out.push({ name, format: 'glb', main, files: { [main]: bytesToBase64(bytes) }, bytes: bytes.length });
  }
  return out;
}

// How models look in the 3D Viewer: the light, the floor grid, the four
// shading modes and the measuring line. Loaded with the viewer.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const AMBER = 0xe5a83a;
const CLAY = 0xbdb8ae;

/** Soft studio light that makes glTF metals and plastics read right. */
export function addStudio(scene, renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = env;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x404040, 0.6);
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(3, 5, 4);
  scene.add(hemi, key);
  return () => env.dispose();
}

/** A floor grid sized to the models, sitting at y = 0. */
export function makeGrid(size, dark) {
  const step = 10 ** Math.floor(Math.log10(Math.max(size, 1e-6)));
  const cells = Math.min(200, Math.max(10, Math.ceil((size * 2) / step)));
  const grid = new THREE.GridHelper(cells * step, cells, dark ? 0x4a4a4a : 0xb5b5b0, dark ? 0x2a2a2a : 0xdcdcd6);
  grid.material.transparent = true;
  grid.material.depthWrite = false;
  grid.renderOrder = -1;
  grid.userData.step = step;
  return grid;
}

function lookMaterial(shading, color) {
  const c = color ? new THREE.Color(color) : new THREE.Color(CLAY);
  if (shading === 'wire') return new THREE.MeshBasicMaterial({ color: color ? c : 0x8a8a84, wireframe: true });
  if (shading === 'xray') {
    return new THREE.MeshStandardMaterial({ color: color ? c : 0x9fb8d0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, roughness: 0.4 });
  }
  return new THREE.MeshStandardMaterial({ color: c, roughness: 0.65, metalness: 0.05, side: THREE.DoubleSide });
}

/**
 * Swap every mesh's material for the chosen look. The model's own materials
 * are kept on the mesh (userData.own) so "Colors" puts them back. A model
 * painted with a color shows that color in Colors and Clay.
 */
export function applyShading(root, shading, color) {
  const mode = shading === 'solid' && color ? 'clay' : shading;
  const shared = mode === 'solid' ? null : lookMaterial(mode, color);
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.userData.own) o.userData.own = o.material;
    if (o.userData.look && o.userData.look !== o.userData.own) o.userData.look.dispose?.();
    o.material = shared || o.userData.own;
    o.userData.look = o.material;
  });
  return shared;
}

/** The measuring line: two amber dots and the line between them. */
export function makeMeasure() {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: AMBER, depthTest: false });
  const dotGeo = new THREE.SphereGeometry(1, 16, 12);
  const a = new THREE.Mesh(dotGeo, mat);
  const b = new THREE.Mesh(dotGeo, mat);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: AMBER, depthTest: false }));
  for (const o of [a, b, line]) o.renderOrder = 10;
  group.add(a, b, line);
  group.visible = false;
  const set = (p, q, dot) => {
    group.visible = Boolean(p);
    if (!p) return;
    a.position.copy(p);
    a.scale.setScalar(dot);
    b.visible = Boolean(q);
    line.visible = Boolean(q);
    if (q) {
      b.position.copy(q);
      b.scale.setScalar(dot);
      lineGeo.setFromPoints([p, q]);
    }
  };
  return { group, set };
}

export function disposeObject(root) {
  root.traverse((o) => {
    o.geometry?.dispose?.();
    for (const m of [].concat(o.userData?.own || [], o.material || [])) {
      for (const v of Object.values(m || {})) if (v?.isTexture) v.dispose();
      m?.dispose?.();
    }
  });
}

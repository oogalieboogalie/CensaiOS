// The 3D view of a YorWare CAD part, in three.js (MIT). Z points up like
// most CAD apps; the grid is the build plate in 10 mm squares. Draws only
// when something changes.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const VIEWS = {
  iso: { dir: [1, -1.15, 0.85], up: [0, 0, 1] },
  front: { dir: [0, -1, 0], up: [0, 0, 1] },
  right: { dir: [1, 0, 0], up: [0, 0, 1] },
  top: { dir: [0, 0, 1], up: [0, 1, 0] },
};

/** Edge lines: a darker shade of the body, or a lighter one on a dark body. */
export function edgeFor(hex) {
  const c = new THREE.Color(hex);
  const hsl = c.getHSL({});
  return c.setHSL(hsl.h, hsl.s * 0.6, hsl.l < 0.35 ? Math.min(1, hsl.l + 0.35) : hsl.l * 0.42);
}

/** A CSS colour (any syntax the browser knows) as a three.js colour. */
export function cssColor(text, fallback = 0x888888) {
  try {
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    const ctx = c.getContext('2d');
    ctx.fillStyle = text;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return a ? new THREE.Color(r / 255, g / 255, b / 255) : new THREE.Color(fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

export function createScene(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  host.appendChild(renderer.domElement);
  renderer.domElement.className = 'hb-yc-gl';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 20000);
  camera.up.set(0, 0, 1);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f98, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(0.6, -0.8, 1.2);
  camera.add(sun);
  scene.add(camera);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.screenSpacePanning = true;

  const part = new THREE.Group();
  scene.add(part);
  let grid = null;
  let gridSize = 60;
  let span = 100;
  let center = new THREE.Vector3();
  let gridColors = [new THREE.Color(0x999999), new THREE.Color(0xcccccc)];

  const render = () => renderer.render(scene, camera);
  controls.addEventListener('change', render);

  function resize() {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  }

  function setGrid(size = gridSize) {
    gridSize = size;
    if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
    const extent = Math.max(100, Math.ceil((size * 1.6) / 20) * 20);
    grid = new THREE.GridHelper(extent, extent / 10, gridColors[0], gridColors[1]);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(Math.round(center.x / 10) * 10, Math.round(center.y / 10) * 10, 0);
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    scene.add(grid);
  }

  function clearPart() {
    for (const child of [...part.children]) {
      part.remove(child);
      child.geometry?.dispose();
      child.material?.dispose();
    }
  }

  function setPart(meshes, bounds) {
    clearPart();
    for (const m of meshes || []) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(m.vertices, 3));
      if (m.normals?.length === m.vertices.length) geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
      geo.setIndex(new THREE.BufferAttribute(m.triangles, 1));
      if (!geo.getAttribute('normal')) geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(m.color), metalness: 0.05, roughness: 0.62, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      });
      part.add(new THREE.Mesh(geo, mat));
      const lines = new THREE.BufferGeometry();
      lines.setAttribute('position', new THREE.BufferAttribute(m.edges, 3));
      part.add(new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: edgeFor(m.color) })));
    }
    if (bounds) {
      const [lo, hi] = bounds;
      center = new THREE.Vector3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
      span = Math.max(1, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]));
      setGrid(Math.max(hi[0] - lo[0], hi[1] - lo[1]));
    }
    render();
  }

  function view(name = 'iso') {
    const v = VIEWS[name] || VIEWS.iso;
    const dir = new THREE.Vector3(...v.dir).normalize();
    const fov = (camera.fov * Math.PI) / 180;
    const fit = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * camera.aspect));
    const dist = (span / 2) / Math.sin(fit / 2) * 1.08;
    camera.up.set(...v.up);
    camera.position.copy(center).addScaledVector(dir, dist);
    camera.near = Math.max(0.1, dist / 200);
    camera.far = dist * 50;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
    render();
  }

  /** The grid takes its colours from the window's theme. */
  function setTheme({ faint, hairline }) {
    gridColors = [cssColor(faint, 0x8a8a8a), cssColor(hairline, 0xc8c8c8)];
    setGrid();
    render();
  }

  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  observer?.observe(host);
  setGrid();
  resize();

  return {
    setPart, view, setTheme, render,
    snapshot: () => { render(); return renderer.domElement.toDataURL('image/png'); },
    dispose() {
      observer?.disconnect();
      controls.dispose();
      clearPart();
      if (grid) { grid.geometry.dispose(); grid.material.dispose(); }
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

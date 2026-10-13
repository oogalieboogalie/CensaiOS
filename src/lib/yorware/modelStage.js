// The 3D Viewer's stage: one three.js renderer, camera and orbit controls
// in a window. It only draws when something moved, so an idle viewer costs
// nothing. Pick, project and snapshot are here too.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { addStudio, applyShading, disposeObject, makeGrid, makeMeasure } from './modelLook.js';
import { arrangeOffsets, sameSizeScale } from './modelMeasure.js';

const DIRS = {
  iso: [1, 0.8, 1.2], front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0.0001],
};

export class ModelStage {
  constructor(host, { dark = true } = {}) {
    this.host = host;
    this.dark = dark;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'hb-y3d-canvas';
    host.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
    this.camera.position.set(3, 2.4, 3.6);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.autoRotateSpeed = 1.6;
    this.controls.addEventListener('change', () => { this.dirty = true; });
    this.dropStudio = addStudio(this.scene, this.renderer);
    this.models = new THREE.Group();
    this.scene.add(this.models);
    this.measure = makeMeasure();
    this.scene.add(this.measure.group);
    this.items = new Map();
    this.view = { shading: 'solid', grid: true, arrange: 'side' };
    this.radius = 1;
    this.onFrame = null;
    this.setTheme(dark);
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      if (this.controls.update() || this.dirty || this.controls.autoRotate) this.draw();
    };
    tick();
  }

  draw() {
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
    this.onFrame?.();
  }

  resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  setTheme(dark) {
    this.dark = dark;
    this.scene.background = new THREE.Color(dark ? 0x0e0e0e : 0xeeeeea);
    this.layout();
  }

  /** items: [{ id, object, show }] in list order; object is what loadModel gave. */
  setModels(items) {
    const keep = new Set(items.map((i) => i.id));
    for (const [id, it] of this.items) {
      if (!keep.has(id) || items.find((i) => i.id === id).object !== it.inner) {
        this.models.remove(it.holder);
        if (!keep.has(id)) disposeObject(it.inner);
        this.items.delete(id);
      }
    }
    for (const { id, object, show } of items) {
      let it = this.items.get(id);
      if (!it) {
        const holder = new THREE.Group();
        holder.add(object);
        holder.userData.modelId = id;
        this.models.add(holder);
        it = { holder, inner: object, show: null };
        this.items.set(id, it);
      }
      it.show = show;
    }
    this.order = items.map((i) => i.id);
    this.layout();
  }

  setView(view) {
    this.view = { ...this.view, ...view };
    this.layout();
  }

  /** Stand models up, place them, apply the look and rebuild the floor. */
  layout() {
    if (!this.items) return;
    const list = (this.order || []).map((id) => this.items.get(id)).filter(Boolean);
    const boxes = list.map(({ holder, inner, show }) => {
      holder.visible = show.visible;
      inner.rotation.set(show.zUp ? -Math.PI / 2 : 0, 0, 0);
      holder.position.set(0, 0, 0);
      holder.scale.setScalar(1);
      holder.updateMatrixWorld(true);
      applyShading(inner, this.view.shading, show.color);
      if (!show.visible) return null;
      const read = () => { const b = new THREE.Box3().setFromObject(holder, true); return b.isEmpty() ? null : { min: b.min.toArray(), max: b.max.toArray() }; };
      if (this.view.arrange !== 'same') return read();
      holder.scale.setScalar(sameSizeScale(read()));
      holder.updateMatrixWorld(true);
      return read();
    });
    const offsets = arrangeOffsets(boxes, this.view.arrange === 'asMade' ? 'asMade' : 'side');
    list.forEach(({ holder }, i) => { holder.position.fromArray(offsets[i]); holder.updateMatrixWorld(true); });
    const all = this.box();
    const size = all ? all.getSize(new THREE.Vector3()).length() : 1;
    this.radius = size / 2 || 1;
    if (this.grid) { this.scene.remove(this.grid); this.grid.geometry.dispose(); this.grid.material.dispose(); }
    this.grid = makeGrid(size, this.dark);
    this.grid.visible = this.view.grid;
    this.scene.add(this.grid);
    this.dirty = true;
  }

  /** The box around every model that is showing (hidden ones don't count). */
  box() {
    const b = new THREE.Box3();
    for (const h of this.models.children) if (h.visible) b.union(new THREE.Box3().setFromObject(h, true));
    return b.isEmpty() ? null : b;
  }

  /** Point the camera at everything from a direction (iso, front, top…). */
  fit(dir = 'iso') {
    const b = this.box();
    const center = b ? b.getCenter(new THREE.Vector3()) : new THREE.Vector3();
    const r = b ? b.getBoundingSphere(new THREE.Sphere()).radius || 1 : 1;
    const dist = r / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.1;
    const d = new THREE.Vector3(...(DIRS[dir] || DIRS.iso)).normalize();
    this.camera.position.copy(center).addScaledVector(d, dist);
    this.camera.near = Math.max(dist / 1000, 1e-4);
    this.camera.far = dist * 100;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.update();
    this.dirty = true;
  }

  setAutoTurn(on) { this.controls.autoRotate = Boolean(on); this.dirty = true; }

  /** What's under a point of the window: { id, world, local } or null. */
  pick(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.params.Points.threshold = this.radius / 200;
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObjects(this.models.children.filter((h) => h.visible), true)[0];
    if (!hit) return null;
    let o = hit.object;
    while (o && o.userData.modelId === undefined) o = o.parent;
    if (!o) return null;
    const it = this.items.get(o.userData.modelId);
    return { id: o.userData.modelId, world: hit.point.clone(), local: it.inner.worldToLocal(hit.point.clone()).toArray() };
  }

  /** A model's own point in the world, or null when the model is hidden or gone. */
  toWorld(id, p) {
    const it = this.items.get(id);
    if (!it || !it.holder.visible) return null;
    return it.inner.localToWorld(new THREE.Vector3(...p));
  }

  /** Screen spot of a world point inside the window: { x, y, behind }. */
  project(world) {
    const v = world.clone().project(this.camera);
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, behind: v.z > 1 };
  }

  setMeasure(a, b) {
    this.measure.set(a, b, this.radius / 120);
    this.dirty = true;
  }

  /** The current view as PNG bytes. */
  snapshot() {
    this.draw();
    const url = this.renderer.domElement.toDataURL('image/png');
    return Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0));
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    for (const it of this.items.values()) disposeObject(it.inner);
    this.dropStudio();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

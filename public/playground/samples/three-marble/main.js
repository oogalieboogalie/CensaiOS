// Marble, the Three.js sample for the censaiOS game playground.
// Roll the marble with the arrow keys or WASD and collect every gem before
// the clock runs long. Colors follow the board's look (window.HB_THEME).
import * as THREE from 'three';

const theme = Object.assign({ bg: '#111214', ink: '#ececef', soft: '#9a9ba1', faint: '#4a4b50', accent: '#5b8cff' }, window.HB_THEME || {});
document.body.style.background = theme.bg;
for (const el of document.querySelectorAll('#hud, #hint')) el.style.color = theme.soft;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
renderer.domElement.tabIndex = 0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(theme.bg);
scene.fog = new THREE.Fog(theme.bg, 18, 42);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
scene.add(new THREE.HemisphereLight(0xffffff, new THREE.Color(theme.faint), 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(6, 12, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 });
scene.add(sun);

// The board: a floating grid of tiles with a few gaps.
const SIZE = 9;
const tiles = new Set();
const tileGeo = new THREE.BoxGeometry(1.94, 0.4, 1.94);
const tileMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.bg).lerp(new THREE.Color(theme.soft), 0.22), roughness: 0.9 });
const holes = new Set(['2,2', '-3,1', '1,-3', '-2,-2', '3,-1']);
for (let x = -Math.floor(SIZE / 2); x <= Math.floor(SIZE / 2); x += 1) {
  for (let z = -Math.floor(SIZE / 2); z <= Math.floor(SIZE / 2); z += 1) {
    if (holes.has(`${x},${z}`)) continue;
    const tile = new THREE.Mesh(tileGeo, tileMat);
    tile.position.set(x * 2, -0.2, z * 2);
    tile.receiveShadow = true;
    scene.add(tile);
    tiles.add(`${x},${z}`);
  }
}
const edges = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(SIZE * 2, 0.4, SIZE * 2)),
  new THREE.LineBasicMaterial({ color: new THREE.Color(theme.soft), transparent: true, opacity: 0.25 }),
);
edges.position.y = -0.2;
scene.add(edges);

const marble = new THREE.Mesh(
  new THREE.SphereGeometry(0.45, 40, 24),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.ink), roughness: 0.25, metalness: 0.1 }),
);
marble.castShadow = true;
scene.add(marble);

const gemGeo = new THREE.OctahedronGeometry(0.32);
const gemMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.accent), emissive: new THREE.Color(theme.accent), emissiveIntensity: 0.6, roughness: 0.3 });
let gems = [];
function placeGems() {
  gems.forEach((g) => scene.remove(g));
  gems = [];
  const spots = [...tiles].filter((k) => k !== '0,0').sort(() => Math.random() - 0.5).slice(0, 8);
  for (const key of spots) {
    const [x, z] = key.split(',').map(Number);
    const gem = new THREE.Mesh(gemGeo, gemMat);
    gem.position.set(x * 2, 0.7, z * 2);
    gem.castShadow = true;
    scene.add(gem);
    gems.push(gem);
  }
}

const keys = new Set();
const KEYMAP = { ArrowUp: 'f', KeyW: 'f', ArrowDown: 'b', KeyS: 'b', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };
window.addEventListener('keydown', (e) => { if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); } if (e.code === 'Space' && done) reset(); });
window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); });
window.addEventListener('blur', () => keys.clear());

const vel = new THREE.Vector3();
let collected = 0;
let started = 0;
let elapsed = 0;
let done = false;
let best = null;
const $score = document.getElementById('score');
const $time = document.getElementById('time');
const $best = document.getElementById('best');
const $hint = document.getElementById('hint');

function reset() {
  marble.position.set(0, 0.45, 0);
  vel.set(0, 0, 0);
  collected = 0;
  started = performance.now();
  done = false;
  placeGems();
  $hint.textContent = 'Arrow keys or WASD to roll. Collect every gem.';
}

function onBoard(p) {
  return tiles.has(`${Math.round(p.x / 2)},${Math.round(p.z / 2)}`);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
reset();

const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  const t = performance.now() / 1000;
  if (!done) {
    const push = 16 * dt;
    if (keys.has('f')) vel.z -= push;
    if (keys.has('b')) vel.z += push;
    if (keys.has('l')) vel.x -= push;
    if (keys.has('r')) vel.x += push;
    vel.x *= 1 - 1.6 * dt;
    vel.z *= 1 - 1.6 * dt;
    if (onBoard(marble.position) && marble.position.y >= 0.44) {
      vel.y = 0;
      marble.position.y = 0.45;
    } else {
      vel.y -= 22 * dt;
    }
    marble.position.addScaledVector(vel, dt);
    const roll = new THREE.Vector3(vel.z, 0, -vel.x);
    if (roll.lengthSq() > 0) marble.rotateOnWorldAxis(roll.normalize(), Math.hypot(vel.x, vel.z) * dt / 0.45);
    if (marble.position.y < -8) { marble.position.set(0, 3, 0); vel.set(0, 0, 0); }
    elapsed = (performance.now() - started) / 1000;
  }

  for (let i = gems.length - 1; i >= 0; i -= 1) {
    const gem = gems[i];
    gem.rotation.y = t * 1.6 + i;
    gem.position.y = 0.7 + Math.sin(t * 2 + i) * 0.08;
    if (!done && gem.position.distanceTo(marble.position) < 0.8) {
      scene.remove(gem);
      gems.splice(i, 1);
      collected += 1;
    }
  }
  if (!done && gems.length === 0) {
    done = true;
    best = best === null ? elapsed : Math.min(best, elapsed);
    $hint.textContent = `All gems in ${elapsed.toFixed(1)} s. Space to go again.`;
  }

  $score.textContent = `Gems ${collected} / ${collected + gems.length}`;
  $time.textContent = `${elapsed.toFixed(1)} s`;
  $best.textContent = best === null ? '' : `Best ${best.toFixed(1)} s`;

  camTarget.set(marble.position.x * 0.6, 0, marble.position.z * 0.6);
  camera.position.lerp(new THREE.Vector3(camTarget.x, 13, camTarget.z + 11), 0.08);
  camera.lookAt(camTarget);
  renderer.render(scene, camera);
});

// The buttons an agent can press in the 3D Editor (declared in the window's
// module.js manifest). Each change goes through the editor's own commands,
// so it shows in the History panel, can be undone, and is saved to the board
// by the editor's autosave like any change made by hand.
import * as THREE from 'three';
import { AddObjectCommand } from '../../../../../vendor/three-editor/js/commands/AddObjectCommand.js';
import { RemoveObjectCommand } from '../../../../../vendor/three-editor/js/commands/RemoveObjectCommand.js';
import { SetPositionCommand } from '../../../../../vendor/three-editor/js/commands/SetPositionCommand.js';
import { SetRotationCommand } from '../../../../../vendor/three-editor/js/commands/SetRotationCommand.js';
import { SetScaleCommand } from '../../../../../vendor/three-editor/js/commands/SetScaleCommand.js';
import { SetMaterialColorCommand } from '../../../../../vendor/three-editor/js/commands/SetMaterialColorCommand.js';
import { SetValueCommand } from '../../../../../vendor/three-editor/js/commands/SetValueCommand.js';
import { SHAPE_NAMES } from './shapeNames.js';

const MAX_LISTED = 200;
const round = (n) => Math.round(n * 1000) / 1000;
const deg = (r) => round(THREE.MathUtils.radToDeg(r));
const vec = (v) => [round(v.x), round(v.y), round(v.z)];

const SHAPES = {
  box: (s) => new THREE.BoxGeometry(s, s, s),
  sphere: (s) => new THREE.SphereGeometry(s / 2, 32, 16),
  cylinder: (s) => new THREE.CylinderGeometry(s / 2, s / 2, s, 32),
  cone: (s) => new THREE.ConeGeometry(s / 2, s, 32),
  torus: (s) => new THREE.TorusGeometry(s / 2, s / 6, 16, 48),
  plane: (s) => new THREE.PlaneGeometry(s, s),
  capsule: (s) => new THREE.CapsuleGeometry(s / 4, s / 2, 8, 16),
};

function triple(value, label) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) throw new Error(`${label} must be three numbers, like [0, 1, 0].`);
  return value;
}

function color(value) {
  if (value === undefined || value === null || value === '') return null;
  const c = new THREE.Color();
  try { c.setStyle(String(value)); } catch { throw new Error(`"${value}" is not a color.`); }
  return c.getHex();
}

function describe(object) {
  const out = { name: object.name || '', type: object.type, id: object.uuid.slice(0, 8), position: vec(object.position), rotation: [object.rotation.x, object.rotation.y, object.rotation.z].map(deg), scale: vec(object.scale) };
  if (object.geometry) out.shape = object.geometry.type.replace(/Geometry$/, '').toLowerCase();
  const material = Array.isArray(object.material) ? object.material[0] : object.material;
  if (material?.color) out.color = `#${material.color.getHexString()}`;
  if (object.parent && !object.parent.isScene) out.parent = object.parent.name || object.parent.uuid.slice(0, 8);
  return out;
}

function find(editor, name) {
  const wanted = String(name || '').trim();
  if (!wanted) throw new Error('Say which object, by its name.');
  let match = null;
  editor.scene.traverse((o) => { if (!match && o !== editor.scene && (o.name === wanted || o.uuid.startsWith(wanted))) match = o; });
  if (!match) throw new Error(`There is no object called "${wanted}" in the scene. read_scene lists them.`);
  return match;
}

export function readScene(editor) {
  const objects = [];
  let total = 0;
  editor.scene.traverse((o) => {
    if (o === editor.scene) return;
    total += 1;
    if (objects.length < MAX_LISTED) objects.push(describe(o));
  });
  return { scene: editor.scene.name, total, objects, more: total > objects.length ? total - objects.length : 0 };
}

export function addShape(editor, { shape, name, color: wanted, position, size }) {
  const make = SHAPE_NAMES.includes(String(shape || '').toLowerCase()) && SHAPES[String(shape).toLowerCase()];
  if (!make) throw new Error(`Shape must be one of: ${SHAPE_NAMES.join(', ')}.`);
  const s = Number.isFinite(size) && size > 0 ? Math.min(size, 1000) : 1;
  const mesh = new THREE.Mesh(make(s), new THREE.MeshStandardMaterial({ color: color(wanted) ?? 0xcccccc }));
  mesh.name = String(name || shape).slice(0, 80);
  const at = triple(position, 'position');
  if (at) mesh.position.fromArray(at);
  editor.execute(new AddObjectCommand(editor, mesh));
  return describe(mesh);
}

export function changeObject(editor, { name, position, rotation, scale, color: wanted, new_name: newName }) {
  const object = find(editor, name);
  const at = triple(position, 'position');
  const turn = triple(rotation, 'rotation');
  const size = triple(scale, 'scale');
  const hex = color(wanted);
  if (at) editor.execute(new SetPositionCommand(editor, object, new THREE.Vector3(...at)));
  if (turn) editor.execute(new SetRotationCommand(editor, object, new THREE.Euler(...turn.map((d) => THREE.MathUtils.degToRad(d)))));
  if (size) editor.execute(new SetScaleCommand(editor, object, new THREE.Vector3(...size)));
  if (hex !== null) {
    if (!object.material?.color) throw new Error(`"${object.name}" has no color to change.`);
    editor.execute(new SetMaterialColorCommand(editor, object, 'color', hex));
  }
  if (newName) editor.execute(new SetValueCommand(editor, object, 'name', String(newName).slice(0, 80)));
  return describe(object);
}

export function removeObject(editor, { name }) {
  const object = find(editor, name);
  const gone = describe(object);
  editor.execute(new RemoveObjectCommand(editor, object));
  return { removed: gone };
}

/** Answer the tools the manifest declares. */
export function handleAgentTools(editor) {
  const tools = window.censai?.tools;
  if (!tools) return;
  tools.handle('read_scene', () => readScene(editor));
  tools.handle('add_shape', (input) => addShape(editor, input));
  tools.handle('change_object', (input) => changeObject(editor, input));
  tools.handle('remove_object', (input) => removeObject(editor, input));
}

// YorWare 3D Editor as a sealed module (manifest v3, docs/modules/manifest-v3.md).
// The code is the three.js editor (MIT, vendor/three-editor) bundled with
// its board glue (src/lib/yorware/threeEditor/sandbox) by
// server/boot/threeEditorBundle.js. At 2.6 MB it is far over what a module
// saved on a board may carry, so it ships with censaiOS as a lazy chunk and
// loads the first time a 3D Editor window opens; the board holds only the
// scene. Plan: docs/specs/13-yorware-suite.md.
import { SHAPE_NAMES } from '../../../lib/yorware/threeEditor/sandbox/shapeNames.js';

const xyz = (what) => ({ type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: what });

export const moduleManifest = {
  manifest: 3,
  id: 'yorware-3d-editor',
  name: '3D Editor',
  version: '0.186.1',
  author: 'three.js authors (MIT license, github.com/mrdoob/three.js/tree/r186/editor), brought in by censaiOS',
  description: 'Build and edit 3D scenes on the board with the three.js editor. Saved on the board for everyone on it.',
  icon: 'CubeEdit',
  size: { w: 1180, h: 760 },
  permissions: ['storage'],
  state: { scene: 'the whole scene: the editor\'s project JSON, gzipped, as base64 text ({ v, z, bytes, raw, at })' },
  tools: [
    { name: 'read_scene', description: 'List the objects in the scene: name, shape, position, rotation in degrees, scale, color.', input: { type: 'object', properties: {} } },
    {
      name: 'add_shape',
      description: 'Add a shape to the scene.',
      input: {
        type: 'object',
        properties: {
          shape: { type: 'string', enum: SHAPE_NAMES },
          name: { type: 'string', description: 'What to call it' },
          color: { type: 'string', description: 'A CSS color name or hex code, like orange' },
          position: xyz('Where, as [x, y, z]; y is up'),
          size: { type: 'number', description: 'Overall size in scene units (default 1)' },
        },
        required: ['shape'],
      },
    },
    {
      name: 'change_object',
      description: 'Move, turn, resize, recolor or rename an object, found by its name.',
      input: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          position: xyz('New position [x, y, z]'),
          rotation: xyz('New rotation in degrees [x, y, z]'),
          scale: xyz('New scale [x, y, z]'),
          color: { type: 'string' },
          new_name: { type: 'string' },
        },
        required: ['name'],
      },
    },
    { name: 'remove_object', description: 'Delete an object from the scene, found by its name.', input: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  ],
};

// Stands in until the editor's code has loaded (it is put in when the window opens).
export const moduleSource = '<p class="muted">Loading the 3D Editor…</p>';

/** The editor's full sealed source: one stylesheet and one script. */
export function loadModuleSource() {
  return import('virtual:yorware-three-editor').then((mod) => mod.default);
}

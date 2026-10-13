// Turn a model stored on the board back into a three.js object, with the
// loaders that ship with three.js (MIT). Loaded only when a 3D Viewer opens.
// Nothing is fetched from the internet: the files a model brought with it
// (.mtl, .bin, textures) are served from memory, anything else is blank.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { VRMLLoader } from 'three/examples/jsm/loaders/VRMLLoader.js';
import { AMFLoader } from 'three/examples/jsm/loaders/AMFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { base64ToBytes } from './pdfBytes.js';

const text = (bytes) => new TextDecoder().decode(bytes);
const buffer = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const leaf = (url) => decodeURIComponent(String(url).split(/[\\/]/).pop().split(/[?#]/)[0]).toLowerCase();

/** A loading manager that answers file requests from the model's own files. */
function localManager(model) {
  const manager = new THREE.LoadingManager();
  const urls = {};
  const canBlob = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined';
  if (canBlob) {
    for (const [name, data] of Object.entries(model.files || {})) {
      if (name === model.main) continue;
      urls[name.toLowerCase()] = URL.createObjectURL(new Blob([base64ToBytes(data)]));
    }
  }
  manager.setURLModifier((url) => {
    if (/^(data|blob):/i.test(url)) return url;
    return urls[leaf(url)] || 'data:,';
  });
  const release = () => { for (const u of Object.values(urls)) URL.revokeObjectURL(u); };
  return { manager, release };
}

function meshFromGeometry(geometry, name) {
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  const colors = Boolean(geometry.getAttribute('color'));
  const mat = new THREE.MeshStandardMaterial({ color: colors ? 0xffffff : 0xb9b4aa, vertexColors: colors, roughness: 0.6, metalness: 0.05 });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.name = name;
  return mesh;
}

function plyObject(bytes, name) {
  const geometry = new PLYLoader().parse(buffer(bytes));
  if (geometry.getAttribute('position')?.count && !/element face [1-9]/.test(text(bytes.subarray(0, 4096)))) {
    const colors = Boolean(geometry.getAttribute('color'));
    geometry.computeBoundingSphere();
    const size = Math.max(geometry.boundingSphere.radius / 400, 1e-4);
    return new THREE.Points(geometry, new THREE.PointsMaterial({ size, vertexColors: colors, color: colors ? 0xffffff : 0xb9b4aa }));
  }
  return meshFromGeometry(geometry, name);
}

function parseGltf(data, manager) {
  const loader = new GLTFLoader(manager);
  loader.setMeshoptDecoder(MeshoptDecoder);
  return new Promise((resolve, reject) => {
    loader.parse(data, '', (gltf) => resolve(gltf.scene || gltf.scenes?.[0]), (err) => reject(err instanceof Error ? err : new Error(String(err?.message || err))));
  });
}

async function parseByFormat(model, bytes, manager) {
  const name = model.name;
  switch (model.format) {
    case 'glb': return parseGltf(buffer(bytes), manager);
    case 'gltf': return parseGltf(text(bytes), manager);
    case 'stl': return meshFromGeometry(new STLLoader().parse(buffer(bytes)), name);
    case 'ply': return plyObject(bytes, name);
    case 'obj': {
      const loader = new OBJLoader(manager);
      const src = text(bytes);
      const mtlName = Object.keys(model.files || {}).find((n) => n.toLowerCase().endsWith('.mtl'));
      if (mtlName) {
        const materials = new MTLLoader(manager).parse(text(base64ToBytes(model.files[mtlName])), '');
        materials.preload();
        loader.setMaterials(materials);
      }
      return loader.parse(src);
    }
    case 'fbx': return new FBXLoader(manager).parse(buffer(bytes), '');
    case '3mf': return new ThreeMFLoader(manager).parse(buffer(bytes));
    case 'dae': return new ColladaLoader(manager).parse(text(bytes), '')?.scene;
    case '3ds': return new TDSLoader(manager).parse(buffer(bytes), '');
    case 'wrl': return new VRMLLoader(manager).parse(text(bytes), '');
    case 'amf': return new AMFLoader(manager).parse(buffer(bytes));
    default: throw new Error(`.${model.format} files can't be opened here yet.`);
  }
}

/** Parse a stored model. Resolves with a three.js Object3D (a Group around the model). */
export async function loadModel(model) {
  const data = model?.files?.[model.main];
  if (!data) throw new Error('This model has no file.');
  const { manager, release } = localManager(model);
  try {
    const obj = await parseByFormat(model, base64ToBytes(data), manager);
    if (!obj) throw new Error('The file has nothing to show.');
    const group = new THREE.Group();
    group.name = model.name;
    group.add(obj);
    const box = new THREE.Box3().setFromObject(group, true);
    group.userData.box = box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() };
    return group;
  } catch (err) {
    throw new Error(`Couldn't open ${model.main}: ${err?.message || err}`);
  } finally {
    // Textures are decoded from the blob URLs asynchronously; give them a moment.
    setTimeout(release, 10000);
  }
}

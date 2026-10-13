/** @jest-environment jsdom */
// YorWare 3D Editor (spec 13, app eight): the three.js editor as a sealed
// module. The scene is packed onto the board, the agent's four buttons work
// through the editor's own commands, the sealed bundle builds with every
// swap and patch applied, and the window is registered like the rest of the
// suite with a valid v3 label.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextEncoder, TextDecoder } from 'node:util';
import { Blob as NodeBlob } from 'node:buffer';
import { CompressionStream, DecompressionStream, ReadableStream } from 'node:stream/web';
import { packScene, unpackScene, sceneContent, fitsOnBoard, MAX_PACKED_BYTES } from '../src/lib/yorware/threeEditor/sandbox/scenePack.js';
import { moduleCsp, buildModuleDocument } from '../src/lib/modules/moduleDocument.js';
import { normalizeManifest } from '../src/lib/modules/moduleFormat.js';
import { validateV3 } from '../src/lib/modules/manifestV3Checks.js';
import { moduleManifest, moduleSource } from '../src/components/windows/yorThreeEditor/module.js';
import { YORWARE_STARTERS } from '../src/lib/yorware/yorwareStarters.js';
import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';
import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';

// jsdom lacks the streaming pieces the sandbox uses; Node has them.
class StreamResponse {
  constructor(stream) { this.stream = stream; }
  async arrayBuffer() { const parts = []; for await (const c of this.stream) parts.push(Buffer.from(c)); return Buffer.concat(parts); }
}
Object.assign(globalThis, { TextEncoder, TextDecoder, ReadableStream, CompressionStream, DecompressionStream, Blob: NodeBlob, Response: StreamResponse });

describe('YorWare 3D Editor: the scene on the board', () => {
  const scene = {
    metadata: {}, project: { shadows: true },
    camera: { object: { uuid: 'cam', matrix: [1, 0, 0, 0] } }, controls: { center: [0, 0, 0] },
    scene: { object: { uuid: 's', children: Array.from({ length: 50 }, (_, i) => ({ uuid: `m${i}`, name: `Box ${i}`, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, i, 0, 0, 1] })) } },
    history: { undos: [{ id: 1 }], redos: [] },
  };

  test('packs and unpacks the editor project, leaving the undo list behind', async () => {
    const record = await packScene(scene);
    expect(record.v).toBe(1);
    expect(record.bytes).toBe(record.z.length);
    expect(record.bytes).toBeLessThan(record.raw);
    const back = await unpackScene(record);
    expect(back.scene).toEqual(scene.scene);
    expect(back.history).toBeUndefined();
    expect(fitsOnBoard(record)).toBe(true);
  });

  test('nothing on the board reads as no scene', async () => {
    expect(await unpackScene(undefined)).toBeNull();
    expect(await unpackScene({ v: 1, z: '' })).toBeNull();
  });

  test('two copies compare equal whatever each person\'s camera is doing', () => {
    const moved = { ...scene, camera: { object: { uuid: 'cam', matrix: [9] } }, controls: { center: [5, 5, 5] }, history: undefined };
    expect(sceneContent(moved)).toBe(sceneContent(scene));
    const edited = { ...scene, scene: { object: { uuid: 's', children: [] } } };
    expect(sceneContent(edited)).not.toBe(sceneContent(scene));
  });

  test('a scene too big for module storage is refused, not cut short', () => {
    expect(fitsOnBoard({ bytes: MAX_PACKED_BYTES + 1 })).toBe(false);
    expect(MAX_PACKED_BYTES).toBeLessThan(256 * 1024);
  });
});

describe('YorWare 3D Editor: the sealed frame', () => {
  test('only windows that open files may read blob: and data: addresses', () => {
    expect(moduleCsp()).toContain("connect-src 'none'");
    expect(moduleCsp({ localFiles: true })).toContain('connect-src blob: data:;');
    expect(moduleCsp({ localFiles: true, network: ['https://ok.example.com'] })).toContain('connect-src blob: data: https://ok.example.com;');
    expect(buildModuleDocument('<p>x</p>', { localFiles: true })).toContain('connect-src blob: data:');
    expect(buildModuleDocument('<p>x</p>')).toContain("connect-src 'none'");
    expect(moduleCsp()).toContain("script-src 'unsafe-inline';");
    expect(moduleCsp({ wasm: true })).toContain("script-src 'unsafe-inline' 'wasm-unsafe-eval';");
  });

  test('its label is a valid v3 label that only asks to save on the board', () => {
    const label = normalizeManifest(moduleManifest);
    expect(validateV3(label)).toEqual([]);
    expect(label.permissions).toEqual(['storage']);
    expect(label.tools.map((t) => t.name)).toEqual(['read_scene', 'add_shape', 'change_object', 'remove_object']);
    expect(typeof moduleSource).toBe('string');
  });

  test('it is in Add > YorWare Suite and opens with a name', () => {
    const entry = WINDOW_MANIFESTS.find((m) => m.kind === 'yorThreeEditor');
    expect(entry).toMatchObject({ label: '3D Editor', sealedModule: true });
    const suite = buildAddSections({ manifests: WINDOW_MANIFESTS }).find((s) => s.label === 'YorWare Suite');
    expect(suite.items.map((i) => i.id)).toContain('kind:yorThreeEditor');
    expect(YORWARE_STARTERS.yorThreeEditor.title).toBe('Untitled scene');
  });
});

describe('YorWare 3D Editor: the bundle', () => {
  let source = '';
  // The bundler's native code can't run inside Jest's sandbox, so build in a child Node.
  beforeAll(() => {
    const bundler = pathToFileURL(path.join(process.cwd(), 'server', 'boot', 'threeEditorBundle.js')).href;
    const script = `import { buildThreeEditorSource } from ${JSON.stringify(bundler)}; process.stdout.write(await buildThreeEditorSource(process.cwd()));`;
    source = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' });
  }, 120000);

  test('builds one stylesheet and one script, safe to put inline', () => {
    expect(source.startsWith('<style>')).toBe(true);
    expect(source.match(/<\/script/gi)).toHaveLength(1); // only the real closing tag
    expect(source).not.toContain('<!--');
    expect(source).toContain(':root.yor-dark');
  });

  test('swaps applied: board storage, no example games, every shape panel packed in', () => {
    expect(source).not.toContain('threejs-editor\',1'); // IndexedDB name from Storage.js
    expect(source).not.toContain('arkanoid.app.json');
    expect(source).toContain('No settings for');
    expect(source).toContain('Scripts are off in censaiOS');
    expect(source).not.toMatch(/import\(\s*`/);
    expect(source).not.toContain('{}.url'); // loaders that find helpers by their own address
    expect(source).toContain('three-editor.invalid');
  });
});

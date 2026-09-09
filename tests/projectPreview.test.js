import { jest } from '@jest/globals';
import {
  buildPreviewHtml,
  buildPreviewWindow,
  normalizePreviewType,
  PREVIEW_TYPES,
  MAX_PREVIEW_BYTES,
} from '../server/collaboration/previewBuilder.js';
import { spawnCanvasWindow } from '../server/collaboration/canvasWindows.js';
import { TOOL_DEFINITIONS } from '../server/tools/definitions.js';
import { TOOL_REGISTRY } from '../server/tools/handlers/index.js';
import { listToolCatalog } from '../server/tools/catalog.js';
import { AGENT_CAPABILITY_MODULES } from '../src/data/agent-capability-modules.js';
import { CAPABILITY_TO_TOOLS } from '../server/tools/rbac/capabilities.js';
import { getToolPackageForModule } from '../server/capabilities/packageCatalog.js';
import { __resetWorkspaceHubForTests } from '../server/collaboration/workspaceHub.js';

// ── previewBuilder: agnostic wrapping ──────────────────────────────────────

test('preview types cover the planned visual set', () => {
  expect(PREVIEW_TYPES).toEqual(expect.arrayContaining(['html', 'threejs', 'react', 'css', 'tailwind']));
});

test('html fragments are wrapped, full documents pass through', () => {
  const wrapped = buildPreviewHtml('html', '<h1>hi</h1>');
  expect(wrapped).toMatch(/<!doctype html>/i);
  expect(wrapped).toContain('<h1>hi</h1>');
  const doc = '<!DOCTYPE html><html><body>raw</body></html>';
  expect(buildPreviewHtml('html', doc)).toBe(doc);
});

test('threejs source lands in a module script with an import map', () => {
  const out = buildPreviewHtml('threejs', 'const s = new THREE.Scene();');
  expect(out).toContain('type="importmap"');
  expect(out).toContain('three.module.js');
  expect(out).toContain('type="module"');
  expect(out).toContain('const s = new THREE.Scene();');
});

test('react source lands in a babel script with a root mount', () => {
  const out = buildPreviewHtml('react', 'const App = () => <h1>hi</h1>; ReactDOM.createRoot(document.getElementById("root")).render(<App />);');
  expect(out).toContain('text/babel');
  expect(out).toContain('id="root"');
  expect(out).toContain('react.production.min.js');
});

test('css ships inside a style tag with a demo body', () => {
  const out = buildPreviewHtml('css', 'h1 { color: red; }');
  expect(out).toContain('<style>');
  expect(out).toContain('h1 { color: red; }');
  expect(out).toContain('<h1>');
});

test('tailwind injects the CDN script for fragments and documents', () => {
  expect(buildPreviewHtml('tailwind', '<div class="p-4">x</div>')).toContain('cdn.tailwindcss.com');
  const doc = '<!doctype html><html><head><title>t</title></head><body class="p-4">x</body></html>';
  const out = buildPreviewHtml('tailwind', doc);
  expect(out).toContain('cdn.tailwindcss.com');
  expect(out).toContain('class="p-4"');
});

test('unknown future types pass through as html', () => {
  expect(buildPreviewHtml('svelte', '<h1>later</h1>')).toContain('<h1>later</h1>');
  expect(normalizePreviewType('three.js')).toBe('threejs');
  expect(normalizePreviewType('three')).toBe('threejs');
});

test('empty and oversized previews are rejected', () => {
  expect(() => buildPreviewHtml('html', '   ')).toThrow(/required/);
  expect(() => buildPreviewWindow({ title: 'Big', previewType: 'html', content: 'x'.repeat(MAX_PREVIEW_BYTES + 1) }))
    .toThrow(/exceeds/);
});

test('buildPreviewWindow returns a canvas-ready htmlPreview payload', () => {
  const win = buildPreviewWindow({ title: 'My Demo!', previewType: 'threejs', content: 'const s=1;' });
  expect(win).toMatchObject({ kind: 'htmlPreview', title: 'My Demo!', previewType: 'threejs' });
  expect(win.fileName).toBe('my-demo.html');
  expect(win.html).toContain('type="importmap"');
});

// ── spawnCanvasWindow: htmlPreview kind ────────────────────────────────────

function database(initialValue, initialRevision = 2) {
  let value = structuredClone(initialValue);
  let revision = initialRevision;
  const client = {
    release: jest.fn(),
    query: jest.fn(async (sql, params = []) => {
      const statement = String(sql);
      if (statement.includes('SELECT value, revision')) return { rows: [{ value, revision }] };
      if (statement.includes('UPDATE workspace_client_state')) {
        value = JSON.parse(params[2]);
        revision += 1;
        return { rows: [{ revision, updated_at: new Date().toISOString() }] };
      }
      return { rows: [] };
    }),
  };
  return {
    db: {
      connect: jest.fn(async () => client),
      query: jest.fn(async () => ({ rows: [{ value, revision }] })),
    },
    client,
    current: () => ({ value, revision }),
  };
}

beforeEach(() => __resetWorkspaceHubForTests());
afterEach(() => __resetWorkspaceHubForTests());

test('spawn stores a 720x520 htmlPreview window with the projected html', async () => {
  const fixture = database({ wins: [] });
  const html = buildPreviewHtml('html', '<h1>demo</h1>');
  const result = await spawnCanvasWindow(fixture.db, {
    workspaceId: 'workspace-a', agentId: 'atlas',
    kind: 'htmlPreview', title: 'Demo', fileName: 'demo.html',
    html, previewType: 'html',
  });
  expect(result.window).toMatchObject({
    kind: 'htmlPreview', title: 'Demo', fileName: 'demo.html', previewType: 'html', w: 720, h: 520,
  });
  expect(result.window.html).toContain('<h1>demo</h1>');
  expect(fixture.current().value.wins).toHaveLength(1);
});

test('spawn allows preview payloads above the 8k note ceiling but caps at 64k', async () => {
  const medium = database({ wins: [] });
  const bigHtml = `<div>${'x'.repeat(20 * 1024)}</div>`;
  await expect(spawnCanvasWindow(medium.db, {
    workspaceId: 'workspace-a', agentId: 'atlas',
    kind: 'htmlPreview', title: 'Big', html: bigHtml,
  })).resolves.toMatchObject({ revision: 3 });

  const tooBig = database({ wins: [] });
  await expect(spawnCanvasWindow(tooBig.db, {
    workspaceId: 'workspace-a', agentId: 'atlas',
    kind: 'htmlPreview', title: 'Too big', html: 'x'.repeat(MAX_PREVIEW_BYTES + 1),
  })).rejects.toMatchObject({ code: 'INVALID_CANVAS_CONTENT' });
  expect(tooBig.client.query).not.toHaveBeenCalledWith('COMMIT');
});

// ── registry wiring ──────────────────────────────────────────────────────

test('project_preview is defined, registered, catalogued, and capability-gated', () => {
  const definition = TOOL_DEFINITIONS.find(tool => tool.function.name === 'project_preview');
  expect(definition).toBeDefined();
  expect(definition.function.parameters.properties.preview_type.enum)
    .toEqual(expect.arrayContaining(['html', 'threejs', 'react', 'css', 'tailwind']));
  expect(definition.function.parameters.required).toEqual(expect.arrayContaining(['title', 'content']));

  expect(typeof TOOL_REGISTRY.project_preview).toBe('function');

  const catalogued = listToolCatalog().tools.find(tool => tool.name === 'project_preview');
  expect(catalogued).toMatchObject({ label: 'Project Preview', category: 'Coordination', risk: 'write' });

  const module = AGENT_CAPABILITY_MODULES.find(entry => entry.id === 'canvas-projector');
  expect(module).toMatchObject({ capabilityId: 'canvas.project', mode: 'execute_with_approval', risk: 'write' });
  expect(module.toolNames).toEqual(['project_preview']);
  expect(CAPABILITY_TO_TOOLS['canvas.project']).toEqual(['project_preview']);
  expect(getToolPackageForModule('canvas-projector')?.module.tools).toEqual(['project_preview']);
});

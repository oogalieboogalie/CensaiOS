/**
 * windowComponentWiring.test.js
 *
 * Catches the "Unknown canvas object type" class of bug at CI time.
 *
 * The root cause: window:validate checks manifest STRUCTURE but never verifies
 * that the component file (a) exists on disk, (b) matches the glob pattern the
 * windowRegistry uses to auto-discover components, or (c) exports the name the
 * registry looks up. All three contracts are enforced here so a future mismatch
 * fails loudly in tests instead of silently at runtime on the canvas.
 *
 * Glob patterns mirrored from src/components/windows/windowRegistry.js:
 *   Flat window:   src/components/<Name>Window.jsx   (matches ../*Window.jsx)
 *   Folder window: src/components/windows/<kind>/index.jsx
 *   Special:       src/components/GenImage.jsx        (explicit exception)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve the expected on-disk absolute path for a manifest entry.
 * Returns null if we can't determine a path (e.g. integration manifests
 * that intentionally have no componentPath yet).
 */
function resolveComponentPath(manifest) {
  if (!manifest.componentPath) return null;
  return path.join(PROJECT_ROOT, manifest.componentPath);
}

/**
 * Determine whether a componentPath matches one of the two valid glob shapes:
 *   1. src/components/<Name>Window.jsx
 *   2. src/components/windows/<kind>/index.jsx
 *   3. src/components/GenImage.jsx   (historical special case)
 */
function matchesGlobPattern(componentPath) {
  if (!componentPath) return false;
  const normalized = componentPath.replace(/\\/g, '/');

  // Shape 1: flat Window file
  if (/^src\/components\/[A-Z][^/]*Window\.jsx$/.test(normalized)) return true;

  // Shape 2: folder window
  if (/^src\/components\/windows\/[^/]+\/index\.jsx$/.test(normalized)) return true;

  // Shape 3: explicit special-case file registered in the glob
  if (normalized === 'src/components/GenImage.jsx') return true;

  return false;
}

/**
 * Check whether a JS/JSX file exports the given named export.
 * Uses a simple regex scan — good enough for the `export function Foo` /
 * `export { Foo }` / `export { X as Foo }` patterns we use.
 */
function fileHasNamedExport(absolutePath, exportName) {
  let src;
  try {
    src = fs.readFileSync(absolutePath, 'utf8');
  } catch {
    return false; // file doesn't exist — caught separately
  }

  // export function Foo / export class Foo / export const Foo
  if (new RegExp(`export\\s+(?:function|class|const|let|var)\\s+${exportName}\\b`).test(src)) return true;

  // export { Foo } or export { X as Foo }
  if (new RegExp(`export\\s*\\{[^}]*\\b(?:${exportName}\\s*,|${exportName}\\s*}|\\w+\\s+as\\s+${exportName}\\b)`).test(src)) return true;

  return false;
}

// ── Build the test matrix ──────────────────────────────────────────────────

// Integration manifests use a different component wiring path (they share
// ProviderConnectWindow). Skip component-file checks for those.
const INTEGRATION_KINDS = new Set(
  WINDOW_MANIFESTS
    .filter((m) => m.integration)
    .map((m) => m.kind)
);

// Manifests that intentionally have no component file (data-only or abstract).
const NO_COMPONENT_KINDS = new Set([]);

const testableManifests = WINDOW_MANIFESTS.filter(
  (m) => !INTEGRATION_KINDS.has(m.kind) && !NO_COMPONENT_KINDS.has(m.kind)
);

// ── Tests ──────────────────────────────────────────────────────────────────

describe('window component wiring — filesystem + glob contract', () => {
  test('every non-integration manifest declares a componentPath', () => {
    const missing = testableManifests.filter((m) => !m.componentPath);
    expect(missing.map((m) => m.kind)).toEqual([]);
  });

  test('every non-integration manifest declares a componentName', () => {
    const missing = testableManifests.filter((m) => !m.componentName);
    expect(missing.map((m) => m.kind)).toEqual([]);
  });

  describe('componentPath matches the windowRegistry glob pattern', () => {
    for (const manifest of testableManifests) {
      test(`[${manifest.kind}] componentPath="${manifest.componentPath}" matches a valid glob shape`, () => {
        const matches = matchesGlobPattern(manifest.componentPath);
        if (!matches) {
          throw new Error(
            `"${manifest.kind}" has componentPath "${manifest.componentPath}" which does NOT match ` +
            'any glob pattern in windowRegistry.js.\n' +
            'Valid shapes:\n' +
            '  src/components/<Name>Window.jsx\n' +
            '  src/components/windows/<kind>/index.jsx\n' +
            'Rename the file or use a folder window to fix this.'
          );
        }
        expect(matches).toBe(true);
      });
    }
  });

  describe('component file exists on disk', () => {
    for (const manifest of testableManifests) {
      test(`[${manifest.kind}] file exists at componentPath`, () => {
        const absPath = resolveComponentPath(manifest);
        if (!absPath) return; // skip if no path (already caught above)
        const exists = fs.existsSync(absPath);
        if (!exists) {
          throw new Error(
            `"${manifest.kind}" points to "${manifest.componentPath}" but the file does not exist on disk.\n` +
            `Expected: ${absPath}`
          );
        }
        expect(exists).toBe(true);
      });
    }
  });

  describe('component file exports the declared componentName', () => {
    for (const manifest of testableManifests) {
      test(`[${manifest.kind}] exports "${manifest.componentName}"`, () => {
        const absPath = resolveComponentPath(manifest);
        if (!absPath || !manifest.componentName) return;
        if (!fs.existsSync(absPath)) return; // already caught above

        const hasExport = fileHasNamedExport(absPath, manifest.componentName);
        if (!hasExport) {
          throw new Error(
            `"${manifest.kind}" declares componentName="${manifest.componentName}" but ` +
            `"${manifest.componentPath}" does not export that name.\n` +
            'The windowRegistry does: mod[manifest.componentName] — it must be a named export.'
          );
        }
        expect(hasExport).toBe(true);
      });
    }
  });
});

describe('window component wiring — no duplicate kinds', () => {
  test('every manifest kind is unique', () => {
    const kinds = WINDOW_MANIFESTS.map((m) => m.kind);
    const dupes = kinds.filter((k, i) => kinds.indexOf(k) !== i);
    expect(dupes).toEqual([]);
  });

  test('every manifest componentName is unique across non-integration windows', () => {
    const names = testableManifests.map((m) => m.componentName).filter(Boolean);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });
});

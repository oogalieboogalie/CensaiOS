/**
 * Integrity / contract tests — the project "safety net".
 *
 * These assert the wiring between the moving parts stays consistent, so that
 * adding or tweaking one thing can't silently break another. They are pure
 * (no DB, no network, no Docker) and run as part of `npm run check`.
 *
 * If you add a window, tool, or icon and one of these fails, it's telling you
 * a wire is missing — fix the wire, don't delete the test.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { Icon } from '../src/components/Icons.jsx';
import {
  WINDOW_MANIFESTS,
  getWindowManifest,
} from '../src/lib/windowManifest.js';
import { WINDOW_REGISTRY } from '../src/lib/windowRegistry.js';
import { TOOL_DEFINITIONS } from '../server/tools/definitions.js';
import {
  SUB_AGENT_TOOL_WHITELIST,
  AGENT_CLASS_TOOL_WHITELIST,
  CORE_AGENT_TOOL_WHITELIST,
} from '../server/tools/definitions.js';
import { TOOL_REGISTRY } from '../server/tools/handlers/index.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Tools referenced by an agent whitelist that are intentionally not backed by a
// `TOOL_DEFINITIONS` entry (handled elsewhere / reserved). Keep this list tiny
// and document why — every name here is a known gap, not a free pass.
const KNOWN_NONDEF_WHITELIST_TOOLS = new Set([
  'generate_image', // genesis: image generation handled outside the tool dispatch
  'set_canvas_hue', // genesis: canvas theming handled client-side
]);

function listSourceFiles(dir, exts = ['.js', '.jsx']) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    if (!exts.includes(path.extname(entry.name))) continue;
    // entry.parentPath (Node 20.12+) or entry.path (older) gives the dir.
    const parent = entry.parentPath || entry.path || dir;
    out.push(path.join(parent, entry.name));
  }
  return out;
}

describe('Window registry integrity', () => {
  test('every manifest entry has a registry record and an existing component file', () => {
    const problems = [];
    for (const m of WINDOW_MANIFESTS) {
      if (!WINDOW_REGISTRY[m.kind]) {
        problems.push(`manifest "${m.kind}" has no WINDOW_REGISTRY[${m.kind}] entry`);
      }
      const filePath = path.join(REPO_ROOT, m.componentPath);
      if (!fs.existsSync(filePath)) {
        problems.push(`manifest "${m.kind}" component file missing: ${m.componentPath}`);
        continue;
      }
      const src = fs.readFileSync(filePath, 'utf8');
      const exported =
        new RegExp(`export\\s+(?:async\\s+)?(?:function|const|class)\\s+${m.componentName}\\b`).test(src) ||
        new RegExp(`export\\s*\\{[^}]*\\b${m.componentName}\\b`).test(src) ||
        new RegExp(`export\\s+default\\s+(?:function\\s+)?${m.componentName}\\b`).test(src);
      if (!exported) {
        problems.push(`manifest "${m.kind}" component "${m.componentName}" not exported from ${m.componentPath}`);
      }
    }
    expect(problems).toEqual([]);
  });

  test('every registry key resolves to a manifest (by kind or canvasType)', () => {
    const orphans = Object.keys(WINDOW_REGISTRY).filter((key) => !getWindowManifest(key));
    expect(orphans).toEqual([]);
  });
});

describe('Icon reference integrity', () => {
  test('every Icon.<Name> referenced in src exists in the Icon set', () => {
    const iconKeys = new Set(Object.keys(Icon));
    const files = listSourceFiles(path.join(REPO_ROOT, 'src'));
    const missing = {};
    const re = /\bIcon\.([A-Z][A-Za-z0-9]*)/g;
    for (const file of files) {
      if (file.endsWith(`${path.sep}Icons.jsx`)) continue;
      const src = fs.readFileSync(file, 'utf8');
      let match;
      while ((match = re.exec(src)) !== null) {
        const name = match[1];
        if (!iconKeys.has(name)) {
          const rel = path.relative(REPO_ROOT, file);
          (missing[name] ||= new Set()).add(rel);
        }
      }
    }
    const report = Object.entries(missing).map(([name, files]) => `Icon.${name} (in ${[...files].join(', ')})`);
    expect(report).toEqual([]);
  });
});

describe('Agent tool wiring integrity', () => {
  const definitionNames = TOOL_DEFINITIONS.map((tool) => tool.function.name);
  const defNames = new Set(TOOL_DEFINITIONS.map((t) => t.function.name));
  const regNames = new Set(Object.keys(TOOL_REGISTRY));

  test('every tool has exactly one definition', () => {
    const duplicates = definitionNames.filter((name, index) => definitionNames.indexOf(name) !== index);
    expect([...new Set(duplicates)]).toEqual([]);
  });

  test('every tool definition has a registered handler', () => {
    const missing = [...defNames].filter((n) => !regNames.has(n));
    expect(missing).toEqual([]);
  });

  test('every registered handler has a tool definition', () => {
    const missing = [...regNames].filter((n) => !defNames.has(n));
    expect(missing).toEqual([]);
  });

  test('every whitelisted tool exists (or is a documented known gap)', () => {
    const whitelisted = new Set();
    for (const map of [SUB_AGENT_TOOL_WHITELIST, AGENT_CLASS_TOOL_WHITELIST, CORE_AGENT_TOOL_WHITELIST]) {
      for (const role of Object.keys(map)) {
        for (const tool of map[role]) whitelisted.add(tool);
      }
    }
    const dangling = [...whitelisted].filter(
      (n) => !defNames.has(n) && !KNOWN_NONDEF_WHITELIST_TOOLS.has(n)
    );
    expect(dangling).toEqual([]);
  });
});

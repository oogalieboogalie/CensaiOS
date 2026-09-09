import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Commit-completeness invariant: every relative import in a tracked source
// file must resolve to another tracked file. `git commit -a` stages edits but
// silently ignores new files, which leaves HEAD referencing modules that only
// exist on the author's disk. Local tests stay green (the files are present)
// and the breakage only surfaces on a clean checkout — exactly what the
// self-host exporter (`git archive HEAD`) and CI consume.
//
// `git ls-files` reflects the index, so this test validates what the *next*
// commit will contain, and the failure message prints the exact `git add`.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIRS = ['src', 'server', 'scripts', 'tools', 'config', 'tests'];
const CODE_EXT = /\.(jsx?|mjs|cjs|tsx?)$/;
const IMPORT_RE = /(?:import\s+(?:[^'"]*?\sfrom\s+)?|export\s+[^'"]*?\sfrom\s+|import\s*\(|require\s*\()\s*['"](\.[^'"]+)['"]/g;
const RESOLVE_EXTS = ['.js', '.jsx', '.mjs', '.cjs', '.json', '.css'];
// Synthetic module names used as validator inputs, plus imports inside
// code-generator templates (scaffolder output text, never executed).
const ALLOW_FIXTURES = new Set([
  'tests/windowImportValidation.test.js -> ./style.css',
  'tests/windowImportValidation.test.js -> ./DemoWindow.css',
  'tests/windowImportValidation.test.js -> ./old.css',
  'tests/windowImportValidation.test.js -> ./DemoWindowWindow.css',
  'scripts/window-sdk.mjs -> ./Windows.jsx',
  'scripts/window-sdk.mjs -> ./Icons.jsx',
  'tools/generate-window.js -> ./Icons.jsx',
  'tools/generate-window.js -> ./Windows.jsx',
  'tools/generate-window.js -> ./HtmlPreviewWindow.jsx',
  'tools/scaffolder/templates/router.template.js -> ./db.js',
  'tools/scaffolder/templates/window.template.jsx -> ./Icons.jsx',
  'tools/scaffolder/templates/window.template.jsx -> ./Windows.jsx',
  'tools/scaffolder/templates/window.template.jsx -> ../lib/api.js',
]);

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function isDynamic(spec) {
  return spec.includes('${') || spec.includes('<') || spec.includes('>') || spec.includes('*');
}

const toPosix = (p) => p.replaceAll('\\', '/');

function loadTracked() {
  const out = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' });
  return new Set(out.split('\n').map((l) => l.trim()).filter(Boolean).map(toPosix));
}

function resolveImport(tracked, fromFile, spec) {
  const clean = spec.split('?')[0].split('#')[0];
  const absBase = path.resolve(path.dirname(fromFile), clean);
  const candidates = [absBase];
  for (const ext of RESOLVE_EXTS) candidates.push(absBase + ext);
  for (const ext of RESOLVE_EXTS) candidates.push(path.join(absBase, `index${ext}`));
  for (const abs of candidates) {
    const rel = toPosix(path.relative(repoRoot, abs));
    if (!rel.startsWith('..') && tracked.has(rel)) return { rel, missing: false };
  }
  const diskBase = candidates.some((abs) => fs.existsSync(abs));
  return { rel: toPosix(path.relative(repoRoot, absBase)), missing: !diskBase, untracked: diskBase };
}

describe('commit completeness', () => {
  test('every relative import resolves to a tracked file', () => {
    const tracked = loadTracked();
    const broken = [];
    const suggestedAdds = new Set();
    for (const rel of [...tracked].sort()) {
      if (!SOURCE_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`))) continue;
      if (!CODE_EXT.test(rel)) continue;
      const abs = path.join(repoRoot, ...rel.split('/'));
      const text = stripComments(fs.readFileSync(abs, 'utf8'));
      for (const match of text.matchAll(IMPORT_RE)) {
        if (isDynamic(match[1])) continue;
        const key = `${rel} -> ${match[1]}`;
        if (ALLOW_FIXTURES.has(key)) continue;
        const result = resolveImport(tracked, abs, match[1]);
        if (result.rel && !tracked.has(result.rel) && !result.rel.endsWith('/')) {
          // Only flag targets that live inside the repo (skip odd absolute escapes).
          if (result.rel.startsWith('..') || path.isAbsolute(result.rel)) continue;
          broken.push(`${rel} -> ${match[1]}`);
          if (result.untracked) suggestedAdds.add(result.rel);
        }
      }
    }
    if (broken.length > 0) {
      const adds = [...suggestedAdds].sort().join(' ');
      throw new Error(
        `Tracked files import ${broken.length} module(s) that are not tracked.\n` +
          broken.map((b) => `  ${b}`).join('\n') +
          (adds ? `\n\nStage the missing files:\n  git add ${adds}` : ''),
      );
    }
    expect(broken).toEqual([]);
  });
});

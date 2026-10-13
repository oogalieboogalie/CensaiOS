import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { slugifyWindowKind, windowComponentName } from './validation.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const WINDOWS_DIR = path.join(PROJECT_ROOT, 'src', 'components', 'windows');

export function parseLlmJsonResponse(rawContent) {
  const jsonStr = String(rawContent || '')
    .replace(/^```(?:json)?\n?/m, '')
    .replace(/```\s*$/m, '')
    .trim();
  return JSON.parse(jsonStr);
}

export function normalizeWindowKind(kind) {
  return slugifyWindowKind(kind || 'importedWindow');
}

export function deriveComponentName(kind) {
  return windowComponentName(kind);
}

export function deriveCssFilename(componentName) {
  return `${componentName}.css`;
}

export function rewriteCssImport({ jsx, componentName }) {
  const cssFile = deriveCssFilename(componentName);
  return String(jsx || '').replace(
    /import\s+['"][^'"]*\.css['"]/,
    `import './${cssFile}'`
  );
}

export function buildMetaSource({ kind, label, componentName, size, launcher }) {
  const launcherBlock = launcher
    ? `,\n  launcher: ${JSON.stringify(launcher)}`
    : '';
  return `export const windowMeta = {
  kind: ${JSON.stringify(kind)},
  label: ${JSON.stringify(label)},
  componentName: ${JSON.stringify(componentName)},
  componentPath: ${JSON.stringify(`src/components/windows/${kind}/index.jsx`)},
  defaultSize: { w: ${size.w}, h: ${size.h} },
  moduleMenu: { show: false, status: 'prototype' }${launcherBlock},
};\n`;
}

export function buildWindowFilePlan({ kind, label, size, jsx, css, launcher }) {
  const normalizedKind = normalizeWindowKind(kind);
  const componentName = deriveComponentName(normalizedKind);
  const cssFilename = deriveCssFilename(componentName);
  const finalJsx = rewriteCssImport({ jsx, componentName });
  const windowDir = path.join(WINDOWS_DIR, normalizedKind);
  const files = [
    { path: path.join(windowDir, 'index.jsx'), source: finalJsx },
    { path: path.join(windowDir, 'meta.js'), source: buildMetaSource({
      kind: normalizedKind,
      label,
      componentName,
      size,
      launcher,
    }) },
  ];

  if (css) {
    files.push({ path: path.join(windowDir, cssFilename), source: css });
  }

  return {
    kind: normalizedKind,
    label,
    componentName,
    defaultSize: size,
    cssFilename,
    windowDir,
    jsx: finalJsx,
    css,
    files,
  };
}

export function writeWindowPackage(filePlan) {
  fs.mkdirSync(filePlan.windowDir, { recursive: true });
  for (const file of filePlan.files) {
    fs.writeFileSync(file.path, file.source, 'utf8');
  }
  return { dir: filePlan.windowDir };
}

export async function runWindowSync() {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['scripts/window-sync.mjs'],
      { cwd: PROJECT_ROOT, timeout: 30_000 }
    );
    return { ok: true, output: stdout + stderr };
  } catch (err) {
    return { ok: false, output: err.stdout + err.stderr + err.message };
  }
}

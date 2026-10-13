// Spec 6 "promote to built-in": a module someone built on the canvas becomes
// a first-party window. It gets a folder under src/components/windows/<kind>/
// like every folder window (meta.js + index.jsx), its own stylesheet under
// src/styles/ with one @import line in src/index.css, and window:sync puts it
// in the Add menu. The module's code keeps running in the same sandbox, so
// promoting it never gives generated code access to the app.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MAX_MODULE_SOURCE_BYTES, normalizeManifest, sourceBytes } from '../../src/lib/modules/moduleFormat.js';
import { toComponentName } from '../../src/lib/windowMeta.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

export const PROMOTED_MENU_ORDER = 70;

function promoteError(message, code, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

/** "Tip calculator for crews" -> "tipCalculatorForCrews". */
export function kindFromName(name) {
  const words = String(name || '').normalize('NFKD').replace(/[^\w\s-]/g, ' ').split(/[\s_-]+/).filter(Boolean)
    .map(w => w.replace(/[^a-zA-Z0-9]/g, '')).filter(Boolean);
  if (!words.length) return 'promotedModule';
  const kind = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('');
  return /^[a-z]/.test(kind) ? kind.slice(0, 40) : `module${kind[0].toUpperCase()}${kind.slice(1)}`.slice(0, 40);
}

/** "tipCalculator" -> "tip-calculator", for the stylesheet and class names. */
export function kebabFromKind(kind) {
  return String(kind).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export function isValidKind(kind) {
  return /^[a-z][a-zA-Z0-9]{1,39}$/.test(String(kind || ''));
}

function js(value) {
  return JSON.stringify(value, null, 2).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function metaSource({ kind, label, componentName, size, icon, hint, promotedFrom }) {
  const moduleMenu = { show: true, status: 'ready', order: PROMOTED_MENU_ORDER, icon, label, hint };
  return `// Promoted from a module built on the canvas (spec 6). \`npm run window:sync\`
// wires it into the manifest; the Add menu lists it like any built-in window.
export const windowMeta = {
  kind: ${JSON.stringify(kind)},
  label: ${JSON.stringify(label)},
  componentName: ${JSON.stringify(componentName)},
  componentPath: ${JSON.stringify(`src/components/windows/${kind}/index.jsx`)},
  defaultSize: { w: ${size.w}, h: ${size.h} },
  moduleMenu: ${JSON.stringify(moduleMenu)},
  lab: ${JSON.stringify({ title: label, props: {} })},
  promotedFrom: ${JSON.stringify(promotedFrom)},
};
`;
}

function moduleSourceFile({ manifest, source, request }) {
  return `// The module's code and manifest, exactly as it was built. It runs in the
// module sandbox (no same-origin access, strict CSP), not on the app page.
// To change it, open the window's source here or rebuild it as a module.
export const moduleRequest = ${js(String(request || ''))};

export const moduleManifest = ${js(manifest)};

export const moduleSource = ${js(source)};
`;
}

function indexSource({ componentName, kebab }) {
  return `/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { PromotedModuleWindow } from '../../modules/PromotedModuleWindow.jsx';
import { windowMeta } from './meta.js';
import { moduleManifest, moduleSource } from './module.js';

export { windowMeta };

export function ${componentName}(props) {
  return <PromotedModuleWindow {...props} meta={windowMeta} manifest={moduleManifest} source={moduleSource} className="hb-${kebab}" />;
}

export default ${componentName};
`;
}

function cssSource({ label, kebab }) {
  return `/*
 * ${label.replace(/\*\//g, '')}: promoted from a module (spec 6). The module styles
 * itself inside its sandbox from the theme tokens; this file is for the
 * window around it. Values come only from tokens.css.
 */

.hb-${kebab} .hb-module-frame { background: var(--surface); }
`;
}

/** Add `@import './styles/<name>.css';` after the last @import, once. */
export function withStyleImport(indexCss, stylesheet) {
  const line = `@import './styles/${stylesheet}';`;
  const text = String(indexCss || '');
  if (text.split('\n').some(l => l.trim() === line)) return text;
  const lines = text.split('\n');
  let last = -1;
  lines.forEach((l, i) => { if (/^@import\s/.test(l.trim())) last = i; });
  lines.splice(last + 1, 0, line);
  return lines.join('\n');
}

/**
 * Everything a promotion would write, without writing it. `existingKinds`
 * is the composed window manifest's kinds, so a promotion can't replace a
 * window that already exists.
 */
export function buildPromotionPlan({ kind, label, hint, manifest, source, request = '', libraryId = null, listingId = null },
  { root = PROJECT_ROOT, existingKinds = [], now = new Date() } = {}) {
  const body = String(source || '');
  if (!body.trim()) throw promoteError('There is no module to promote yet.', 'MODULE_SOURCE_REQUIRED');
  if (sourceBytes(body) > MAX_MODULE_SOURCE_BYTES) throw promoteError('This module is too large to promote.', 'MODULE_TOO_LARGE', 413);
  const clean = normalizeManifest(manifest, { request });
  const finalLabel = String(label || clean.name).replace(/\s+/g, ' ').trim().slice(0, 48) || clean.name;
  const finalKind = kind ? String(kind).trim() : kindFromName(finalLabel);
  if (!isValidKind(finalKind)) throw promoteError('The window id must start with a letter and use only letters and numbers (like tipCalculator).', 'PROMOTE_KIND_INVALID');
  const windowsDir = path.join(root, 'src', 'components', 'windows');
  const windowDir = path.join(windowsDir, finalKind);
  const taken = new Set(existingKinds.map(k => String(k).toLowerCase()));
  if (taken.has(finalKind.toLowerCase()) || fs.existsSync(windowDir)) {
    throw promoteError(`A window called "${finalKind}" already exists. Pick another id.`, 'PROMOTE_KIND_TAKEN', 409);
  }

  const componentName = toComponentName(finalKind);
  const kebab = kebabFromKind(finalKind);
  const stylesheet = `${kebab}.css`;
  const stylePath = path.join(root, 'src', 'styles', stylesheet);
  if (fs.existsSync(stylePath)) throw promoteError(`src/styles/${stylesheet} already exists. Pick another id.`, 'PROMOTE_KIND_TAKEN', 409);
  const indexCssPath = path.join(root, 'src', 'index.css');
  const indexCss = fs.existsSync(indexCssPath) ? fs.readFileSync(indexCssPath, 'utf8') : '';
  const promotedFrom = {
    at: now.toISOString(),
    ...(libraryId ? { libraryId: String(libraryId) } : {}),
    ...(listingId ? { listingId: String(listingId) } : {}),
  };
  const finalHint = String(hint || clean.description || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const finalManifest = { ...clean, name: finalLabel };

  const files = [
    { path: path.join(windowDir, 'meta.js'), source: metaSource({ kind: finalKind, label: finalLabel, componentName, size: clean.size, icon: clean.icon, hint: finalHint, promotedFrom }) },
    { path: path.join(windowDir, 'index.jsx'), source: indexSource({ componentName, kebab }) },
    { path: path.join(windowDir, 'module.js'), source: moduleSourceFile({ manifest: finalManifest, source: body, request }) },
    { path: stylePath, source: cssSource({ label: finalLabel, kebab }) },
    { path: indexCssPath, source: withStyleImport(indexCss, stylesheet), edit: true },
  ];
  return {
    kind: finalKind,
    label: finalLabel,
    componentName,
    stylesheet,
    windowDir,
    files,
    relativeFiles: files.map(f => ({ path: path.relative(root, f.path).split(path.sep).join('/'), edit: Boolean(f.edit) })),
  };
}

export function writePromotion(plan) {
  fs.mkdirSync(plan.windowDir, { recursive: true });
  for (const file of plan.files) {
    fs.mkdirSync(path.dirname(file.path), { recursive: true });
    fs.writeFileSync(file.path, file.source, 'utf8');
  }
  return { dir: plan.windowDir };
}

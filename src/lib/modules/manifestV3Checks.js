// Manifest v3 checks: an agent's tool input against what the module
// declared, the v3 label for built-in windows, and plain-words validation
// (used by `npm run window:validate`). The label rules live in manifestV3.js.

import { MANIFEST_VERSION, RUNS_APP, RUNS_SEALED, TOOL_NAME, V3_PERMISSIONS, cleanVersion, declares } from './manifestV3.js';

function cleanText(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function typeOk(type, value) {
  if (type === 'string') return typeof value === 'string';
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  return true;
}

/**
 * Check an agent's input against a tool's declared input. Numbers written as
 * text ("42") are accepted for number fields, since models often send them so.
 * Returns { ok, input, error }.
 */
export function checkToolInput(tool, raw) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  const props = tool?.input?.properties || {};
  for (const key of tool?.input?.required || []) {
    if (input[key] === undefined || input[key] === null || input[key] === '') return { ok: false, error: `"${key}" is required.` };
  }
  for (const [key, value] of Object.entries(input)) {
    const spec = props[key];
    if (!spec) { delete input[key]; continue; }
    if ((spec.type === 'number' || spec.type === 'integer') && typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      input[key] = Number(value);
    }
    if (!typeOk(spec.type, input[key])) return { ok: false, error: `"${key}" should be ${spec.type === 'integer' ? 'a whole number' : `a ${spec.type}`}.` };
    if (Array.isArray(spec.enum) && !spec.enum.includes(input[key])) return { ok: false, error: `"${key}" should be one of: ${spec.enum.join(', ')}.` };
  }
  return { ok: true, input };
}

/**
 * The v3 label for a built-in window. Built-ins stay inside the app (they
 * need the terminal, files, Docker or the network as you), so they say so.
 */
export function builtinManifest(windowManifest) {
  const m = windowManifest || {};
  const size = m.defaultSize && Number(m.defaultSize.w) && Number(m.defaultSize.h)
    ? { w: Number(m.defaultSize.w), h: Number(m.defaultSize.h) }
    : null;
  return {
    manifest: MANIFEST_VERSION,
    id: String(m.kind || ''),
    name: String(m.label || m.title || m.kind || ''),
    version: cleanVersion(m.version),
    author: 'censaiOS',
    description: cleanText(m.description || m.moduleMenu?.hint || '', 160),
    runs: m.sealedModule ? RUNS_SEALED : RUNS_APP,
    window: { size },
    size,
    permissions: [],
    network: [],
    tools: [],
  };
}

/** Problems with a v3 manifest, in plain words (empty when it is valid). */
export function validateV3(manifest) {
  const problems = [];
  const m = manifest || {};
  if (Number(m.manifest) !== MANIFEST_VERSION) problems.push('manifest must be 3');
  if (!m.id || !/^[a-zA-Z0-9][\w-]{0,47}$/.test(String(m.id))) problems.push('id must be short letters, numbers or dashes');
  if (!m.name) problems.push('name is missing');
  if (!/^\d+\.\d+\.\d+$/.test(String(m.version || ''))) problems.push('version must look like 1.0.0');
  if (![RUNS_SEALED, RUNS_APP].includes(m.runs)) problems.push('runs must be "sealed" or "app"');
  for (const p of Array.isArray(m.permissions) ? m.permissions : []) {
    if (!V3_PERMISSIONS.includes(p)) problems.push(`unknown permission "${p}"`);
  }
  if (m.runs === RUNS_APP && (m.permissions || []).length) problems.push('built-in windows run in the app; permissions are for sealed modules');
  if (declares(m, 'network') && !(m.network || []).length) problems.push('network needs at least one host');
  for (const tool of Array.isArray(m.tools) ? m.tools : []) {
    if (!TOOL_NAME.test(String(tool?.name || ''))) problems.push(`tool name "${tool?.name}" must be lower_snake_case`);
    if (!tool?.description) problems.push(`tool "${tool?.name}" needs a description`);
  }
  return problems;
}

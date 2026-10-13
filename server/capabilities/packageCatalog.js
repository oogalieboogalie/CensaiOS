import crypto from 'node:crypto';
import { AGENT_CAPABILITY_MODULES } from '../../src/data/agent-capability-modules.js';

export const TOOL_PACKAGE_SCHEMA = 'censai.tool-package.v1';
export const TOOL_PACKAGE_VERSION = '1.0.0';

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
}

export function canonicalPackageJson(manifest) {
  return JSON.stringify(canonicalValue(manifest));
}

export function toolPackageManifestHash(manifest) {
  return crypto.createHash('sha256').update(canonicalPackageJson(manifest)).digest('hex');
}

function manifestFor(module) {
  const manifest = {
    schemaVersion: TOOL_PACKAGE_SCHEMA,
    id: `censai/${module.id}`,
    version: TOOL_PACKAGE_VERSION,
    name: `${module.name} Add-on`,
    description: module.description,
    publisher: { id: 'censai-core', name: 'Censai Core' },
    installScope: 'workspace',
    module: {
      id: module.id,
      name: module.name,
      slot: module.slot,
      capabilityId: module.capabilityId,
      risk: module.risk,
      mode: module.mode,
      tools: [...module.toolNames],
    },
  };
  return Object.freeze({
    ...manifest,
    publisher: Object.freeze(manifest.publisher),
    module: Object.freeze({ ...manifest.module, tools: Object.freeze(manifest.module.tools) }),
    manifestHash: toolPackageManifestHash(manifest),
  });
}

export const REVIEWED_TOOL_PACKAGES = Object.freeze(AGENT_CAPABILITY_MODULES.map(manifestFor));
export const TOOL_PACKAGE_BY_ID = Object.freeze(Object.fromEntries(
  REVIEWED_TOOL_PACKAGES.map(pkg => [pkg.id, pkg]),
));
export const TOOL_PACKAGE_BY_MODULE_ID = Object.freeze(Object.fromEntries(
  REVIEWED_TOOL_PACKAGES.map(pkg => [pkg.module.id, pkg]),
));

export function getReviewedToolPackage(packageId) {
  return TOOL_PACKAGE_BY_ID[String(packageId || '').trim()] || null;
}

export function getToolPackageForModule(moduleId) {
  return TOOL_PACKAGE_BY_MODULE_ID[String(moduleId || '').trim()] || null;
}

export function toolPackageLockKey(workspaceId, moduleId) {
  const pkg = getToolPackageForModule(moduleId);
  return pkg ? `tool-package:${String(workspaceId || '').trim()}:${pkg.id}` : null;
}

export function isCurrentToolPackageInstall(row, moduleId = row?.module_id) {
  const pkg = getToolPackageForModule(moduleId);
  return Boolean(pkg && row?.package_id === pkg.id && row?.package_version === pkg.version
    && row?.manifest_hash === pkg.manifestHash && row?.module_id === pkg.module.id);
}

import { deriveRegistryEntry } from './windowMeta.js';
import { isIntegrationManifest, normalizeIntegration } from './windowIntegrationTypes.js';
import { OPS_WINDOW_MANIFESTS } from './manifest/opsWindows.js';
import { CORE_WINDOW_MANIFESTS } from './manifest/coreWindows.js';
import { MEDIA_WINDOW_MANIFESTS } from './manifest/mediaWindows.js';
import { INTEGRATION_WINDOW_MANIFEST_DATA } from './manifest/integrationWindows.js';
import { FACTORY_WINDOW_MANIFESTS } from './manifest/factoryWindows.js';

export const WINDOW_MANIFEST_VERSION = 2;

/**
 * Module types in the registry. `window` is the default. The discriminator lets
 * the same manifest hold provider integrations, importable agents, and (later)
 * installable packages — the seed of the npm-style package manifest. See
 * docs/WINDOW_INTEGRATION_SPEC.md and .team/ROADMAP.md (Unification Fact #1).
 */
export const MODULE_TYPES = Object.freeze(['window', 'integration', 'agent', 'package']);
export const DEFAULT_MODULE_TYPE = 'window';

export const FALLBACK_WINDOW_SIZE = Object.freeze({ w: 360, h: 320 });

// The manifest DATA lives in pure-data category files under src/lib/manifest/
// (one entry per window — adding a window is still a one-entry edit there).
// New windows from window:sync / window:scaffold land in factoryWindows.js.
// Ops first: window-lab defaults to WINDOW_MANIFESTS[0] (terminal).
export const WINDOW_MANIFESTS = Object.freeze([
  ...OPS_WINDOW_MANIFESTS,
  ...CORE_WINDOW_MANIFESTS,
  ...MEDIA_WINDOW_MANIFESTS,
  ...INTEGRATION_WINDOW_MANIFEST_DATA,
  ...FACTORY_WINDOW_MANIFESTS,
]);

export const WINDOW_MANIFEST_BY_KIND = Object.freeze(Object.fromEntries(
  WINDOW_MANIFESTS.map((manifest) => [manifest.kind, manifest])
));

export const WINDOW_MANIFEST_BY_CANVAS_TYPE = Object.freeze(Object.fromEntries(
  WINDOW_MANIFESTS.map((manifest) => [manifest.canvasType || manifest.kind, manifest])
));

// WINDOW_REGISTRY is the browser-facing Module Registry for windows, DERIVED
// from the manifest as the single source of truth. Each entry expands through
// deriveRegistryEntry (src/lib/windowMeta.js): defaults filled in, with runtime
// overrides and Control Plane fields authored flat on the manifest entry.
// Canvas-type aliases (e.g. todos -> todo) get their own key so lookups by
// canvas type still resolve. Do NOT hand-author registry entries — add a
// manifest entry instead.
export const WINDOW_REGISTRY = Object.freeze(WINDOW_MANIFESTS.reduce((acc, manifest) => {
  const entry = Object.freeze(deriveRegistryEntry(manifest));
  acc[manifest.kind] = entry;
  if (manifest.canvasType && manifest.canvasType !== manifest.kind) {
    acc[manifest.canvasType] = entry;
  }
  return acc;
}, {}));

export const DEFAULT_WINDOW_SIZES = Object.freeze(Object.fromEntries(
  Object.entries(WINDOW_REGISTRY).map(([kind, config]) => [kind, Object.freeze({ ...config.defaultSize })])
));

export const LEGACY_KIND_TO_CANVAS_TYPE = Object.freeze(Object.fromEntries(
  WINDOW_MANIFESTS
    .filter((manifest) => manifest.canvasType && manifest.canvasType !== manifest.kind)
    .map((manifest) => [manifest.kind, manifest.canvasType])
));

export const CANVAS_TYPE_TO_LEGACY_KIND = Object.freeze(Object.fromEntries(
  WINDOW_MANIFESTS
    .filter((manifest) => manifest.canvasType && manifest.canvasType !== manifest.kind)
    .map((manifest) => [manifest.canvasType, manifest.kind])
));

export const CANVAS_OBJECT_TYPES = Object.freeze([
  ...new Set([
    ...WINDOW_MANIFESTS.map((manifest) => manifest.canvasType || manifest.kind),
    'chrome',
    'generic',
  ]),
]);

export const INTEGRATION_WINDOW_MANIFESTS = Object.freeze(
  WINDOW_MANIFESTS.filter(isIntegrationManifest)
);

/** Whether a registered window is ready for the user-facing Modules menu. */
export function isWindowVisibleInModuleMenu(manifest) {
  return manifest?.moduleMenu?.show !== false;
}

export const MODULE_MENU_MANIFESTS = Object.freeze(
  WINDOW_MANIFESTS.filter(isWindowVisibleInModuleMenu)
);

/** Resolve a manifest's module type, defaulting to 'window'. */
export function getModuleType(manifest) {
  const t = manifest && manifest.type;
  return MODULE_TYPES.includes(t) ? t : DEFAULT_MODULE_TYPE;
}

/** Manifests grouped by module type ('window' | 'integration' | 'agent' | 'package'). */
export const MODULE_MANIFESTS_BY_TYPE = Object.freeze(
  WINDOW_MANIFESTS.reduce((acc, manifest) => {
    const t = getModuleType(manifest);
    (acc[t] = acc[t] || []).push(manifest);
    return acc;
  }, {})
);

/**
 * Launcher tiles, declaratively derived from the manifest and sorted by
 * `launcher.order`. The canvas empty-state renders these directly, so adding a
 * window's tile is a manifest `launcher` block — never a hand-edited button.
 */
export const LAUNCHER_MANIFESTS = Object.freeze(
  WINDOW_MANIFESTS
    .filter((m) => m.launcher && m.launcher.show)
    .slice()
    .sort((a, b) => (a.launcher.order ?? 999) - (b.launcher.order ?? 999))
);

export const WINDOW_MANIFEST_BY_PROVIDER = Object.freeze(Object.fromEntries(
  INTEGRATION_WINDOW_MANIFESTS.map((manifest) => [manifest.integration.provider.id, manifest])
));

export function getWindowManifest(kindOrType) {
  return WINDOW_MANIFEST_BY_KIND[kindOrType]
    || WINDOW_MANIFEST_BY_CANVAS_TYPE[kindOrType]
    || null;
}

/**
 * Normalized integration metadata for a window kind/canvas type, or `null` if
 * the window is not a provider integration. App and UI code can enumerate
 * INTEGRATION_WINDOW_MANIFESTS / look up by provider id instead of branching
 * on specific kinds.
 */
export function getWindowIntegration(kindOrType) {
  const manifest = getWindowManifest(kindOrType);
  return isIntegrationManifest(manifest) ? normalizeIntegration(manifest.integration) : null;
}

export function getDefaultWindowSize(kindOrType) {
  const regEntry = WINDOW_REGISTRY[kindOrType];
  if (regEntry) return { ...regEntry.defaultSize };
  const manifest = getWindowManifest(kindOrType);
  return manifest?.defaultSize
    ? { ...manifest.defaultSize }
    : { ...FALLBACK_WINDOW_SIZE };
}

export function buildWindowTypes(componentMap) {
  return Object.freeze(WINDOW_MANIFESTS.reduce((acc, manifest) => {
    const component = componentMap[manifest.kind] || componentMap[manifest.componentName];
    if (!component) return acc;
    acc[manifest.kind] = component;
    if (manifest.canvasType && manifest.canvasType !== manifest.kind) {
      acc[manifest.canvasType] = component;
    }
    return acc;
  }, {}));
}

export function buildWindowLabObject(kindOrType, overrides = {}) {
  const manifest = getWindowManifest(kindOrType);
  const size = getDefaultWindowSize(kindOrType);
  const now = new Date().toISOString();
  const kind = manifest?.kind || kindOrType || 'generic';
  const canvasType = manifest?.canvasType || kind;
  const lab = manifest?.lab || {};
  return {
    id: overrides.id || `lab-${kind}`,
    kind,
    type: canvasType,
    title: overrides.title || lab.title || manifest?.label || kind,
    x: 0,
    y: 0,
    width: size.w,
    height: size.h,
    w: size.w,
    h: size.h,
    state: {},
    metadata: {},
    createdBy: 'window-lab',
    lockedBy: null,
    createdAt: now,
    updatedAt: now,
    ...(lab.props || {}),
    ...overrides,
  };
}

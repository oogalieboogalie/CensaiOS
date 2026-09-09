// WINDOW_REGISTRY is now DERIVED from the single source of truth in
// windowManifest.js (which expands each manifest entry through
// deriveRegistryEntry in windowMeta.js). This file remains only as a stable
// import path for existing consumers. Do NOT hand-author registry entries here
// — add a manifest entry in src/lib/windowManifest.js instead.
// See docs/WINDOW_INTEGRATION_SPEC.md.
export { WINDOW_REGISTRY } from './windowManifest.js';

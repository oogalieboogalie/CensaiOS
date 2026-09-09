import React from 'react';
import { buildWindowTypes, WINDOW_MANIFESTS, CANVAS_TYPE_TO_LEGACY_KIND, WINDOW_REGISTRY } from '../../lib/windowManifest.js';

// Dynamic auto-discovery of window components using Vite lazy glob imports.
// Two shapes are supported:
//   1. Flat files:     src/components/<Name>Window.jsx   (legacy convention)
//   2. Folder windows: src/components/windows/<kind>/index.jsx  (drop-in factory)
// Folder windows declare themselves in a co-located meta.js and are wired into
// the central manifest + registry by `npm run window:sync`.

let windowModules = {};
let folderModules = {};
try {
  windowModules = import.meta.glob(['../*Window.jsx', '../GenImage.jsx']);
  folderModules = import.meta.glob(['./*/index.jsx']);
} catch (e) {
  // Ignore fallback for Jest / non-Vite environments
}

export const WINDOW_COMPONENTS = {};

// Components are wired automatically below from the manifest via import.meta.glob.
// Do NOT hand-import window components here — add a manifest entry and name the
// component file src/components/<Name>Window.jsx (or a folder window). The loop
// resolves it. See docs/WINDOW_INTEGRATION_SPEC.md.
for (const manifest of WINDOW_MANIFESTS) {
  const componentPath = manifest.componentPath || '';
  // Folder window? e.g. src/components/windows/helloFactory/index.jsx
  const folderMatch = componentPath.match(/src\/components\/windows\/([^/]+)\/index\.jsx$/);
  let loader;
  let relativePath;
  if (folderMatch) {
    relativePath = `./${folderMatch[1]}/index.jsx`;
    loader = folderModules[relativePath];
  } else {
    const fileName = componentPath.split('/').pop();
    relativePath = `../${fileName}`;
    loader = windowModules[relativePath];
  }
  if (loader) {
    WINDOW_COMPONENTS[manifest.kind] = React.lazy(() => loader().then((mod) => {
      const component = mod[manifest.componentName];
      if (!component) throw new Error(`Missing export "${manifest.componentName}" in "${relativePath}"`);
      return { default: component };
    }));
  } else {
    // If not in Vite environment (e.g. running in Jest), we ignore silently unless glob is active
    if (typeof import.meta.glob === 'function') {
      console.warn(`Dynamic window loader: could not find component "${manifest.componentName}" at path "${relativePath}"`);
    }
  }
}

export const WINDOW_TYPES = buildWindowTypes(WINDOW_COMPONENTS);

// Explicitly export these components individually for external imports (e.g. canvas.jsx)
export const DocWindow = WINDOW_COMPONENTS.doc;
export const GenImageWindow = WINDOW_COMPONENTS.genImage;
export const BrowserWindow = WINDOW_COMPONENTS.browser;
export const SpotifyWindow = WINDOW_COMPONENTS.spotify;

// Validate in dev without aborting React module evaluation.
if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
  Object.keys(WINDOW_TYPES).forEach(k => {
    const kind = CANVAS_TYPE_TO_LEGACY_KIND[k] || k;
    if (!WINDOW_REGISTRY[kind]) {
      console.error(`[windowRegistry] Missing registry entry for window type "${k}" (kind "${kind}")`);
    }
  });
}

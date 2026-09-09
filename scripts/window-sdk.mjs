#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateIntegrationMetadata } from '../src/lib/windowIntegrationTypes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const paths = {
  manifest: path.join(repoRoot, 'src', 'lib', 'windowManifest.js'),
  factoryManifest: path.join(repoRoot, 'src', 'lib', 'manifest', 'factoryWindows.js'),
  windows: path.join(repoRoot, 'src', 'components', 'Windows.jsx'),
  windowRegistry: path.join(repoRoot, 'src', 'components', 'windows', 'windowRegistry.js'),
  emptyState: path.join(repoRoot, 'src', 'components', 'canvas', 'CanvasEmptyState.jsx'),
};

const MODULE_TYPE_VALUES = ['window', 'integration', 'agent', 'package'];
const PERSISTENCE_VALUES = ['workspace', 'local_only'];
const MODE_AVAILABILITY_KEYS = ['local_desktop', 'private_server', 'cloud_saas'];
const INSTALL_SCOPE_VALUES = ['global', 'tenant', 'workspace', 'user', 'session', 'local_only'];
const RUNTIME_AFFINITY_VALUES = ['browser', 'server', 'local_desktop', 'private_server', 'cloud_saas', 'sandbox', 'worker'];

function usage() {
  return `Window SDK

Commands:
  node scripts/window-sdk.mjs list
  node scripts/window-sdk.mjs validate
  node scripts/window-sdk.mjs scaffold <kind> --component <NameWindow> --label "Name" [--width 420] [--height 320] [--title "Lab title"]
  node scripts/window-sdk.mjs new --name "Window Name" [--kind windowName] [--button "Run"] [--text "Window body text"] [--width 520] [--height 360]

Examples:
  npm run window:list
  npm run window:validate
  npm run window:scaffold -- browserAgent --component BrowserAgentWindow --label "Browser Agent" --width 720 --height 520
  npm run window:new -- --name "Repo Tools" --button "Run check" --text "Small focused repo tool."
`;
}

function parseArgs(argv) {
  const [command, maybeKind, ...rest] = argv;
  const tokens = maybeKind?.startsWith('--') ? [maybeKind, ...rest] : rest;
  const options = {};
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (key === 'dry-run') {
      options.dryRun = true;
      continue;
    }
    if (key === 'no-register') {
      options.register = false;
      continue;
    }
    options[key] = tokens[i + 1];
    i += 1;
  }
  return { command, kind: maybeKind?.startsWith('--') ? null : maybeKind, options };
}

async function loadManifestModule() {
  const url = pathToFileURL(paths.manifest).href + `?t=${Date.now()}-${Math.random()}`;
  return import(url);
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeText(filePath, text, dryRun) {
  if (dryRun) return;
  fs.writeFileSync(filePath, text);
}

function toComponentName(kind) {
  const normalized = String(kind || '')
    .replace(/[_-]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toUpperCase());
  return normalized.endsWith('Window') ? normalized : `${normalized}Window`;
}

function toKindFromName(name) {
  const words = String(name || '')
    .trim()
    .replace(/['"]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return '';
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      return index === 0 ? lower : lower.replace(/^(.)/, (_, c) => c.toUpperCase());
    })
    .join('');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertIdentifier(kind) {
  if (!/^[a-z][A-Za-z0-9_]*$/.test(kind || '')) {
    throw new Error(`Invalid kind "${kind}". Use camelCase or snake_case starting with a lowercase letter.`);
  }
}

function assertComponentName(componentName) {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(componentName || '')) {
    throw new Error(`Invalid component name "${componentName}". Use a PascalCase React export.`);
  }
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function jsString(value) {
  return JSON.stringify(String(value || ''));
}

function componentTemplate({ componentName, label, title, bodyText, buttonLabel }) {
  const safeLabel = jsString(label);
  const safeTitle = jsString(title || label);
  const safeBody = jsString(bodyText || 'This window is scaffolded and ready for real behavior.');
  const safeButton = jsString(buttonLabel || 'Run');
  return `import React from 'react';
import { WindowTitle } from './Windows.jsx';
import { Icon } from './Icons.jsx';

export function ${componentName}({ win, onUpdate }) {
  const [runCount, setRunCount] = React.useState(0);
  const [lastRunAt, setLastRunAt] = React.useState(null);

  const runAction = () => {
    setRunCount((count) => count + 1);
    setLastRunAt(new Date().toLocaleString());
  };

  return (
    <>
      <WindowTitle
        icon={<Icon.NewWindow size={14} />}
        label={win.title || ${safeLabel}}
        subtitle={lastRunAt ? \`ran \${lastRunAt}\` : 'ready'}
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter(agentId => agentId !== id) })}
      />
      <div style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        color: 'var(--ink)',
        background: 'var(--surface)',
        fontFamily: 'var(--font-ui)',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, lineHeight: 1.2 }}>{${safeTitle}}</h2>
          <p style={{ margin: '8px 0 0', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
            {${safeBody}}
          </p>
        </div>

        <button
          type="button"
          onClick={runAction}
          style={{
            all: 'unset',
            cursor: 'pointer',
            alignSelf: 'flex-start',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            minHeight: 34,
            padding: '0 12px',
            borderRadius: 8,
            background: 'var(--accent)',
            color: 'white',
            fontSize: 12,
            fontWeight: 800,
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <Icon.Plus size={13} />
          {${safeButton}}
        </button>

        <div style={{ marginTop: 'auto', padding: 10, border: '1px solid var(--hairline)', borderRadius: 8, background: 'var(--surface-2)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-faint)' }}>
          action_count: {runCount}
        </div>
      </div>
    </>
  );
}
`;
}

function manifestEntry({ kind, canvasType, label, componentName, componentPath, width, height, title }) {
  const labTitle = title || label;
  return `  {
    kind: '${kind}',
    canvasType: '${canvasType}',
    label: '${label.replace(/'/g, "\\'")}',
    componentName: '${componentName}',
    componentPath: '${componentPath.replace(/\\/g, '/')}',
    defaultSize: { w: ${width}, h: ${height} },
    moduleMenu: { show: false, status: 'prototype' },
    lab: { title: '${labTitle.replace(/'/g, "\\'")}' },
  },
`;
}

function insertBefore(text, marker, insertion, fileName) {
  const index = text.indexOf(marker);
  if (index === -1) {
    throw new Error(`Could not find insertion marker in ${fileName}: ${marker}`);
  }
  return `${text.slice(0, index)}${insertion}${text.slice(index)}`;
}

function replaceOnce(text, search, replacement, fileName) {
  if (!text.includes(search)) {
    throw new Error(`Could not find update marker in ${fileName}: ${search}`);
  }
  return text.replace(search, replacement);
}

async function listWindows() {
  const { WINDOW_MANIFESTS } = await loadManifestModule();
  for (const item of WINDOW_MANIFESTS) {
    const size = item.defaultSize || {};
    console.log(`${item.kind.padEnd(16)} ${String(item.canvasType || item.kind).padEnd(16)} ${String(item.componentName).padEnd(28)} ${size.w || '?'}x${size.h || '?'}  ${item.label}`);
  }
}

async function validateWindows({ quiet = false } = {}) {
  const {
    WINDOW_MANIFESTS,
    CANVAS_OBJECT_TYPES,
    LEGACY_KIND_TO_CANVAS_TYPE,
    CANVAS_TYPE_TO_LEGACY_KIND,
  } = await loadManifestModule();
  const errors = [];
  const warnings = [];
  const seenKinds = new Set();
  const seenCanvasTypes = new Set();
  const seenProviderIds = new Map();
  const windowsText = readText(paths.windows);
  const windowRegistryText = readText(paths.windowRegistry);
  const appText = readText(path.join(repoRoot, 'src', 'app', 'AppContent.jsx'));
  const objectTypesText = readText(path.join(repoRoot, 'src', 'lib', 'canvasObjectTypes.js'));
  const emptyStateText = readText(paths.emptyState);
  const usesDynamicDiscovery = windowRegistryText.includes('import.meta.glob');

  for (const item of WINDOW_MANIFESTS) {
    if (!/^[a-z][A-Za-z0-9_]*$/.test(item.kind || '')) errors.push(`${item.kind}: invalid kind`);
    if (seenKinds.has(item.kind)) errors.push(`${item.kind}: duplicate kind`);
    seenKinds.add(item.kind);

    const canvasType = item.canvasType || item.kind;
    if (seenCanvasTypes.has(canvasType)) errors.push(`${item.kind}: duplicate canvasType "${canvasType}"`);
    seenCanvasTypes.add(canvasType);

    if (!item.componentName) errors.push(`${item.kind}: missing componentName`);
    if (!item.componentPath) errors.push(`${item.kind}: missing componentPath`);
    if (item.componentPath) {
      const componentFile = path.join(repoRoot, item.componentPath);
      if (!fs.existsSync(componentFile)) errors.push(`${item.kind}: componentPath does not exist (${item.componentPath})`);
    }

    const size = item.defaultSize || {};
    if (!Number.isFinite(size.w) || !Number.isFinite(size.h)) errors.push(`${item.kind}: defaultSize must include numeric w and h`);

    const componentName = escapeRegExp(item.componentName || '');
    const kind = escapeRegExp(item.kind || '');
    if (!usesDynamicDiscovery) {
      if (item.componentName && !new RegExp(`import\\s+\\{\\s*${componentName}\\s*\\}`).test(windowsText)) {
        errors.push(`${item.kind}: Windows.jsx does not import ${item.componentName}`);
      }
      if (item.componentName && item.kind && !new RegExp(`${kind}\\s*:\\s*${componentName}`).test(windowsText)) {
        errors.push(`${item.kind}: WINDOW_COMPONENTS does not map ${item.kind} to ${item.componentName}`);
      }
    } else if (item.componentPath && !/^src\/components\/(?:[^/]+\.jsx|windows\/[^/]+\/index\.jsx)$/.test(item.componentPath)) {
      errors.push(`${item.kind}: dynamic discovery supports src/components/*.jsx or src/components/windows/<kind>/index.jsx component paths`);
    }
    if (!CANVAS_OBJECT_TYPES.includes(canvasType)) {
      errors.push(`${item.kind}: canvasType "${canvasType}" is not exported in CANVAS_OBJECT_TYPES`);
    }
    if (canvasType !== item.kind) {
      if (LEGACY_KIND_TO_CANVAS_TYPE[item.kind] !== canvasType) {
        errors.push(`${item.kind}: missing legacy kind -> canvas type alias`);
      }
      if (CANVAS_TYPE_TO_LEGACY_KIND[canvasType] !== item.kind) {
        errors.push(`${item.kind}: missing canvas type -> legacy kind alias`);
      }
    }

    // Optional Window Integration Contract metadata (provider windows).
    if (Object.prototype.hasOwnProperty.call(item, 'integration')) {
      const result = validateIntegrationMetadata(item.integration, { label: item.kind });
      for (const error of result.errors) errors.push(error);
      for (const warning of result.warnings) warnings.push(warning);

      const providerId = item.integration?.provider?.id;
      if (typeof providerId === 'string') {
        const existingKind = seenProviderIds.get(providerId);
        if (existingKind) {
          errors.push(`${item.kind}: duplicate integration provider.id "${providerId}" already used by ${existingKind}`);
        } else {
          seenProviderIds.set(providerId, item.kind);
        }
      }
    }

    // Module type discriminator (optional; defaults to 'window').
    if (Object.prototype.hasOwnProperty.call(item, 'type') && !MODULE_TYPE_VALUES.includes(item.type)) {
      errors.push(`${item.kind}: type must be one of [${MODULE_TYPE_VALUES.join(', ')}] (got ${JSON.stringify(item.type)})`);
    }

    // Runtime overrides (optional; authored flat on the manifest entry).
    if (Object.prototype.hasOwnProperty.call(item, 'persistence') && !PERSISTENCE_VALUES.includes(item.persistence)) {
      errors.push(`${item.kind}: persistence must be one of [${PERSISTENCE_VALUES.join(', ')}] (got ${JSON.stringify(item.persistence)})`);
    }
    if (Object.prototype.hasOwnProperty.call(item, 'modeAvailability')) {
      const ma = item.modeAvailability;
      if (!ma || typeof ma !== 'object' || Array.isArray(ma)) {
        errors.push(`${item.kind}: modeAvailability must be an object`);
      } else {
        for (const [key, val] of Object.entries(ma)) {
          if (!MODE_AVAILABILITY_KEYS.includes(key)) errors.push(`${item.kind}: modeAvailability key "${key}" is not one of [${MODE_AVAILABILITY_KEYS.join(', ')}]`);
          if (typeof val !== 'boolean') errors.push(`${item.kind}: modeAvailability.${key} must be a boolean`);
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(item, 'installScope') && !INSTALL_SCOPE_VALUES.includes(item.installScope)) {
      errors.push(`${item.kind}: installScope must be one of [${INSTALL_SCOPE_VALUES.join(', ')}] (got ${JSON.stringify(item.installScope)})`);
    }
    if (Object.prototype.hasOwnProperty.call(item, 'runtimeAffinity') && !RUNTIME_AFFINITY_VALUES.includes(item.runtimeAffinity)) {
      errors.push(`${item.kind}: runtimeAffinity must be one of [${RUNTIME_AFFINITY_VALUES.join(', ')}] (got ${JSON.stringify(item.runtimeAffinity)})`);
    }
    for (const field of ['requiredCapabilities', 'sideEffects', 'artifactTypes']) {
      if (!Object.prototype.hasOwnProperty.call(item, field)) continue;
      if (!Array.isArray(item[field]) || item[field].some(value => typeof value !== 'string' || !value.trim())) {
        errors.push(`${item.kind}: ${field} must be an array of non-empty strings`);
      }
    }

    // Launcher tile metadata (optional; rendered by CanvasEmptyState).
    if (Object.prototype.hasOwnProperty.call(item, 'launcher')) {
      const L = item.launcher;
      if (!L || typeof L !== 'object' || Array.isArray(L)) {
        errors.push(`${item.kind}: launcher must be an object`);
      } else {
        if (typeof L.show !== 'boolean') errors.push(`${item.kind}: launcher.show must be a boolean`);
        if (L.show) {
          if (!Number.isFinite(L.order)) errors.push(`${item.kind}: launcher.order must be a number`);
          if (typeof L.icon !== 'string' || !L.icon.trim()) errors.push(`${item.kind}: launcher.icon must be a non-empty string (an Icon name)`);
        }
        if (L.props !== undefined && (typeof L.props !== 'object' || L.props === null || Array.isArray(L.props))) {
          errors.push(`${item.kind}: launcher.props must be an object`);
        }
        if (L.sizeOverride !== undefined && (!Number.isFinite(L.sizeOverride?.w) || !Number.isFinite(L.sizeOverride?.h))) {
          errors.push(`${item.kind}: launcher.sizeOverride must include numeric w and h`);
        }
      }
    }
  }

  if (!usesDynamicDiscovery) {
    errors.push('Windows.jsx is not using dynamic window discovery');
  } else {
    if (!windowRegistryText.includes("'../*Window.jsx'") && !windowRegistryText.includes('"../*Window.jsx"')) {
      errors.push('windowRegistry.js dynamic discovery must scan src/components/*.jsx from src/components/windows via ../*Window.jsx');
    }
    if (!windowRegistryText.includes("'../GenImage.jsx'") && !windowRegistryText.includes('"../GenImage.jsx"')) {
      errors.push('windowRegistry.js dynamic discovery must include ../GenImage.jsx');
    }
    if (!windowRegistryText.includes('`../${fileName}`')) {
      errors.push('windowRegistry.js dynamic discovery lookup must use ../${fileName}');
    }
  }
  if (!windowRegistryText.includes('buildWindowTypes(WINDOW_COMPONENTS)')) {
    errors.push('windowRegistry.js is not building WINDOW_TYPES from WINDOW_COMPONENTS');
  }
  // Contract enforcement: components must be discovered via the manifest + glob,
  // never hand-imported. A sibling-component import (`from '../XWindow.jsx'`) or a
  // manual WINDOW_COMPONENTS[...] assignment means someone bypassed the contract.
  if (/import\s+\{[^}]*\}\s+from\s+['"]\.\.\/[A-Za-z][^'"/]*\.jsx['"]/.test(windowRegistryText)) {
    errors.push("windows/windowRegistry.js has a hand-imported window component (from '../*.jsx'). Remove it — add a manifest entry and let import.meta.glob wire it. See docs/WINDOW_INTEGRATION_SPEC.md.");
  }
  if (/WINDOW_COMPONENTS\s*\[\s*['"]/.test(windowRegistryText)) {
    errors.push("windows/windowRegistry.js has a manual WINDOW_COMPONENTS['kind'] = ... assignment. Remove it — the manifest loop wires components automatically.");
  }
  // Contract enforcement: launcher tiles are declared in the manifest `launcher`
  // block and rendered from LAUNCHER_MANIFESTS, never hardcoded in the empty state.
  if (!emptyStateText.includes('LAUNCHER_MANIFESTS')) {
    errors.push('CanvasEmptyState.jsx must render launcher tiles from LAUNCHER_MANIFESTS (manifest-driven).');
  }
  if (/onSpawn\(\s*['"]/.test(emptyStateText)) {
    errors.push("CanvasEmptyState.jsx has a hardcoded launcher tile (onSpawn('kind', ...)). Declare the tile via a manifest `launcher` block instead.");
  }
  if (!appText.includes('getDefaultWindowSize')) {
    errors.push('AppContent.jsx is not using getDefaultWindowSize for spawn sizing');
  }
  if (/const\s+DEFAULT_SIZES\s*=/.test(appText)) {
    errors.push('AppContent.jsx still has a local DEFAULT_SIZES table');
  }
  if (!objectTypesText.includes("from './windowManifest.js'")) {
    errors.push('canvasObjectTypes.js is not deriving type aliases from windowManifest.js');
  }

  if (warnings.length && !quiet) {
    console.warn(`Window SDK validation warnings (${warnings.length}):`);
    for (const warning of warnings) console.warn(`- ${warning}`);
  }

  if (errors.length) {
    console.error(`Window SDK validation failed (${errors.length}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return false;
  }
  if (!quiet) console.log(`Window SDK validation passed for ${WINDOW_MANIFESTS.length} windows.`);
  return true;
}

async function scaffoldWindow(kind, options) {
  assertIdentifier(kind);
  const { WINDOW_MANIFEST_BY_KIND } = await loadManifestModule();
  if (WINDOW_MANIFEST_BY_KIND[kind]) {
    throw new Error(`Window kind "${kind}" already exists.`);
  }

  const componentName = options.component || toComponentName(kind);
  assertComponentName(componentName);
  const label = options.label || kind.replace(/_/g, ' ');
  const width = parseNumber(options.width, 420);
  const height = parseNumber(options.height, 320);
  const canvasType = options['canvas-type'] || kind;
  assertIdentifier(canvasType);

  const componentFileName = options.file || `${componentName}.jsx`;
  if (!componentFileName.endsWith('.jsx')) {
    throw new Error('Component file must be a .jsx file.');
  }
  const componentPath = path.join('src', 'components', componentFileName).replace(/\\/g, '/');
  const componentAbsolute = path.join(repoRoot, componentPath);
  if (fs.existsSync(componentAbsolute)) {
    throw new Error(`Component file already exists: ${componentPath}`);
  }

  const dryRun = Boolean(options.dryRun);
  const shouldRegister = options.register !== false;
  const template = componentTemplate({
    componentName,
    label,
    title: options.title,
    bodyText: options.text,
    buttonLabel: options.button,
  });

  if (!dryRun) fs.mkdirSync(path.dirname(componentAbsolute), { recursive: true });
  writeText(componentAbsolute, template, dryRun);

  if (shouldRegister) {
    const entry = manifestEntry({ kind, canvasType, label, componentName, componentPath, width, height, title: options.title });
    // New windows register in the factory data file — the composer
    // (windowManifest.js) and curated category files stay closed to
    // mechanical writes so the size ratchet never trips on a new window.
    const manifestText = readText(paths.factoryManifest);
    const updatedManifest = insertBefore(
      manifestText,
      '  // window:sync inserts new windows above this line — do not remove.',
      entry,
      'src/lib/manifest/factoryWindows.js'
    );
    writeText(paths.factoryManifest, updatedManifest, dryRun);
    // Component wiring is automatic: src/components/windows/windowRegistry.js
    // discovers src/components/*Window.jsx via import.meta.glob and maps it from
    // the manifest. Do NOT hand-edit Windows.jsx / windowRegistry.js — validate
    // enforces that the manifest entry is the single source of truth.
  }

  console.log(`${dryRun ? 'Would scaffold' : 'Scaffolded'} ${kind}:`);
  console.log(`- ${componentPath}`);
  if (shouldRegister) {
    console.log('- registered in src/lib/manifest/factoryWindows.js (single source of truth)');
    console.log('- component auto-wired via import.meta.glob (no other edits needed)');
  }
  if (!dryRun && shouldRegister) {
    await validateWindows({ quiet: false });
  }
}

async function newWindow(options) {
  const label = String(options.name || options.label || '').trim();
  if (!label) throw new Error('Missing --name for new window.');
  const kind = options.kind || toKindFromName(label);
  const component = options.component || toComponentName(kind);
  await scaffoldWindow(kind, {
    ...options,
    component,
    label,
    title: options.title || label,
    width: options.width || 520,
    height: options.height || 360,
    text: options.text || `${label} is ready for implementation.`,
    button: options.button || 'Run',
  });
}

async function main() {
  const { command, kind, options } = parseArgs(process.argv.slice(2));
  if (!command || command === 'help' || command === '--help') {
    console.log(usage());
    return;
  }
  if (command === 'list') {
    await listWindows();
    return;
  }
  if (command === 'validate') {
    await validateWindows();
    return;
  }
  if (command === 'scaffold') {
    if (!kind) throw new Error('Missing window kind for scaffold.');
    await scaffoldWindow(kind, options);
    return;
  }
  if (command === 'new') {
    await newWindow(options);
    return;
  }
  throw new Error(`Unknown command "${command}".\n\n${usage()}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

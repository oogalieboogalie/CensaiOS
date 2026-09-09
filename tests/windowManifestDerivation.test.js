// Single-source registration contract — the manifest is the one declaration and
// WINDOW_REGISTRY, the module-type grouping, and the launcher tiles are all
// DERIVED from it. These tests lock that derivation so a future edit can't
// silently reintroduce a second hand-authored registry or a hardcoded launcher.

import {
  WINDOW_MANIFESTS,
  WINDOW_REGISTRY,
  WINDOW_MANIFEST_BY_KIND,
  MODULE_MANIFESTS_BY_TYPE,
  LAUNCHER_MANIFESTS,
  MODULE_MENU_MANIFESTS,
  getModuleType,
  DEFAULT_MODULE_TYPE,
  MODULE_TYPES,
  WINDOW_MANIFEST_VERSION,
} from '../src/lib/windowManifest.js';
import { DEFAULT_MODE_AVAILABILITY, normalizeWindowMeta, deriveManifestEntry } from '../src/lib/windowMeta.js';

describe('WINDOW_REGISTRY is derived from the manifest', () => {
  test('manifest version marks module registry v2 metadata', () => {
    expect(WINDOW_MANIFEST_VERSION).toBe(2);
  });

  test('default window gets default runtime metadata', () => {
    const chat = WINDOW_REGISTRY.chat;
    expect(chat.componentKey).toBe('ChatWindow');
    expect(chat.title).toBe('Chat'); // derived from label
    expect(chat.canPin).toBe(true);
    expect(chat.canSpawnFromRegion).toBe(true);
    expect(chat.persistence).toBe('workspace');
    expect(chat.entitlement).toBe('windows.chat'); // default: windows.<kind>
    expect(chat.modeAvailability).toEqual(DEFAULT_MODE_AVAILABILITY);
    expect(chat.installScope).toBe('workspace');
    expect(chat.runtimeAffinity).toBe('browser');
    expect(chat.requiredCapabilities).toEqual([]);
    expect(chat.sideEffects).toEqual([]);
    expect(chat.artifactTypes).toEqual([]);
  });

  test('flat runtime overrides on the manifest entry are honored', () => {
    // files opts out of cloud + uses a custom entitlement/persistence
    expect(WINDOW_REGISTRY.files.persistence).toBe('local_only');
    expect(WINDOW_REGISTRY.files.installScope).toBe('local_only');
    expect(WINDOW_REGISTRY.files.entitlement).toBe('local_filesystem.access');
    expect(WINDOW_REGISTRY.files.modeAvailability.cloud_saas).toBe(false);
    expect(WINDOW_REGISTRY.files.modeAvailability.local_desktop).toBe(true);
    // terminal + vex are local/server only
    expect(WINDOW_REGISTRY.terminal.modeAvailability.cloud_saas).toBe(false);
    expect(WINDOW_REGISTRY.vex.modeAvailability.cloud_saas).toBe(false);
  });

  test('canvas-type aliases get their own registry entry (todos -> todo)', () => {
    expect(WINDOW_REGISTRY.todos).toBeDefined();
    expect(WINDOW_REGISTRY.todo).toBeDefined();
    expect(WINDOW_REGISTRY.todo).toBe(WINDOW_REGISTRY.todos); // same derived entry
  });

  test('registry titles equal manifest labels (no duplicate source of truth)', () => {
    for (const m of WINDOW_MANIFESTS) {
      expect(WINDOW_REGISTRY[m.kind].title).toBe(m.label);
    }
  });
});

describe('module type discriminator', () => {
  test('defaults to "window" when unspecified', () => {
    expect(getModuleType(WINDOW_MANIFEST_BY_KIND.chat)).toBe(DEFAULT_MODULE_TYPE);
    expect(DEFAULT_MODULE_TYPE).toBe('window');
  });

  test('every manifest groups under a known type', () => {
    const grouped = Object.values(MODULE_MANIFESTS_BY_TYPE).flat();
    expect(grouped.length).toBe(WINDOW_MANIFESTS.length);
    expect(Object.keys(MODULE_MANIFESTS_BY_TYPE).every((t) => MODULE_TYPES.includes(t))).toBe(true);
  });

  // providerConnect was descoped (commented out in integrationWindows.js).
  // The "providerConnect is typed as an integration" and "integration-typed
  // entries align with INTEGRATION_WINDOW_MANIFESTS (providerConnect)" tests
  // were removed; if the feature returns, re-add them.
});

describe('launcher tiles are derived and sorted', () => {
  test('only launcher.show entries are included', () => {
    expect(LAUNCHER_MANIFESTS.every((m) => m.launcher && m.launcher.show)).toBe(true);
    const hidden = WINDOW_MANIFESTS.filter((m) => !m.launcher || !m.launcher.show);
    expect(LAUNCHER_MANIFESTS.some((m) => hidden.includes(m))).toBe(false);
  });

  test('sorted ascending by launcher.order', () => {
    const orders = LAUNCHER_MANIFESTS.map((m) => m.launcher.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  test('chat is the first tile and carries its spawn props', () => {
    expect(LAUNCHER_MANIFESTS[0].kind).toBe('chat');
    expect(LAUNCHER_MANIFESTS[0].launcher.props).toEqual({ agentId: 'censai' });
  });

  test('folder-window meta can declare its own launcher tile (micro-app contract)', () => {
    const meta = {
      kind: 'asteroids',
      label: 'Asteroids',
      defaultSize: { w: 480, h: 400 },
      launcher: { show: true, order: 400, icon: 'Tools', label: 'Asteroids', hint: 'play while agents work' },
    };
    expect(normalizeWindowMeta(meta).launcher.show).toBe(true);
    expect(deriveManifestEntry(meta).launcher).toEqual(meta.launcher);
    // and omitting it stays omitted (no accidental tile)
    expect(deriveManifestEntry({ kind: 'x', label: 'X', defaultSize: { w: 1, h: 1 } }).launcher).toBeUndefined();
  });
});

describe('Modules menu visibility is derived from manifest maturity', () => {
  test('prototype and internal windows remain registered but undiscoverable', () => {
    const hiddenKinds = WINDOW_MANIFESTS
      .filter((manifest) => manifest.moduleMenu?.show === false)
      .map((manifest) => manifest.kind);
    expect(hiddenKinds).toEqual(expect.arrayContaining([
      'workflow', 'analyticsBoard', 'rook', 'sovereignTest',
    ]));
    expect(MODULE_MENU_MANIFESTS.some((manifest) => hiddenKinds.includes(manifest.kind))).toBe(false);
    for (const kind of hiddenKinds) expect(WINDOW_REGISTRY[kind]).toBeDefined();
  });
});

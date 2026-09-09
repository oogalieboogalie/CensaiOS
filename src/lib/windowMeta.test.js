// Tests for the drop-in window factory.
//
// Two layers:
//   1. Pure derivation helpers (windowMeta.js) — the contract every window
//      folder relies on. If these stay correct, `window:sync` stays correct.
//   2. End-to-end proof: the reference folder window (helloFactory) declared in
//      one meta.js must derive to exactly the records that were synced into the
//      central manifest + registry. This is what guarantees "drop a folder, run
//      sync, the window is wired" actually holds.

import {
  FALLBACK_WINDOW_SIZE,
  DEFAULT_MODE_AVAILABILITY,
  DEFAULT_INSTALL_SCOPE,
  DEFAULT_RUNTIME_AFFINITY,
  toComponentName,
  normalizeWindowMeta,
  deriveManifestEntry,
  deriveRegistryEntry,
  selectNewMetas,
} from './windowMeta.js';
import { WINDOW_MANIFEST_BY_KIND } from './windowManifest.js';
import { WINDOW_REGISTRY } from './windowRegistry.js';
import { windowMeta as helloFactoryMeta } from '../components/windows/helloFactory/meta.js';

describe('toComponentName', () => {
  test('appends Window and capitalizes a simple kind', () => {
    expect(toComponentName('doc')).toBe('DocWindow');
  });

  test('camel-cases snake/kebab kinds', () => {
    expect(toComponentName('hello_factory')).toBe('HelloFactoryWindow');
    expect(toComponentName('hello-factory')).toBe('HelloFactoryWindow');
  });

  test('does not double-suffix kinds that already end in Window', () => {
    expect(toComponentName('genImageWindow')).toBe('GenImageWindow');
  });

  test('falls back to UnknownWindow on empty input', () => {
    expect(toComponentName('')).toBe('UnknownWindow');
    expect(toComponentName(null)).toBe('UnknownWindow');
  });
});

describe('normalizeWindowMeta', () => {
  test('fails loud when required fields are missing', () => {
    expect(() => normalizeWindowMeta({})).toThrow(/kind is required/);
    expect(() => normalizeWindowMeta({ kind: 'x' })).toThrow(/label is required/);
  });

  test('derives sensible defaults from kind + label alone', () => {
    const m = normalizeWindowMeta({ kind: 'notes', label: 'Notes' });
    expect(m.canvasType).toBe('notes');
    expect(m.componentName).toBe('NotesWindow');
    expect(m.title).toBe('Notes');
    expect(m.canPin).toBe(true);
    expect(m.canSpawnFromRegion).toBe(true);
    expect(m.persistence).toBe('workspace');
    expect(m.entitlement).toBe('windows.notes');
    expect(m.modeAvailability).toEqual(DEFAULT_MODE_AVAILABILITY);
    expect(m.installScope).toBe(DEFAULT_INSTALL_SCOPE);
    expect(m.runtimeAffinity).toBe(DEFAULT_RUNTIME_AFFINITY);
    expect(m.requiredCapabilities).toEqual([]);
    expect(m.sideEffects).toEqual([]);
    expect(m.artifactTypes).toEqual([]);
    expect(m.moduleMenu).toEqual({ show: false, status: 'prototype' });
  });

  test('honors explicit overrides', () => {
    const m = normalizeWindowMeta({
      kind: 'notes',
      label: 'Notes',
      canvasType: 'sticky',
      componentName: 'StickyWindow',
      title: 'Sticky Notes',
      canPin: false,
      canSpawnFromRegion: false,
      persistence: 'local_only',
      entitlement: 'windows.sticky',
      modeAvailability: { cloud_saas: false },
      installScope: 'tenant',
      runtimeAffinity: 'private_server',
      requiredCapabilities: ['window.write'],
      sideEffects: ['filesystem.write'],
      artifactTypes: ['generated_window'],
      moduleMenu: { show: true, status: 'beta' },
    });
    expect(m.canvasType).toBe('sticky');
    expect(m.componentName).toBe('StickyWindow');
    expect(m.title).toBe('Sticky Notes');
    expect(m.canPin).toBe(false);
    expect(m.canSpawnFromRegion).toBe(false);
    expect(m.persistence).toBe('local_only');
    expect(m.entitlement).toBe('windows.sticky');
    // partial overrides merge onto defaults
    expect(m.modeAvailability).toEqual({
      local_desktop: true,
      private_server: true,
      cloud_saas: false,
    });
    expect(m.installScope).toBe('tenant');
    expect(m.runtimeAffinity).toBe('private_server');
    expect(m.requiredCapabilities).toEqual(['window.write']);
    expect(m.sideEffects).toEqual(['filesystem.write']);
    expect(m.artifactTypes).toEqual(['generated_window']);
    expect(m.moduleMenu).toEqual({ show: true, status: 'beta' });
  });

  test('local-only persistence defaults installation scope to local_only', () => {
    const m = normalizeWindowMeta({
      kind: 'files',
      label: 'Files',
      persistence: 'local_only',
    });
    expect(m.installScope).toBe('local_only');
  });

  test('falls back to a safe size when defaultSize is invalid', () => {
    const m = normalizeWindowMeta({ kind: 'x', label: 'X', defaultSize: { w: 'big' } });
    expect(m.defaultSize).toEqual(FALLBACK_WINDOW_SIZE);
  });

  test('returns a frozen object (windows cannot be mutated after declaration)', () => {
    const m = normalizeWindowMeta({ kind: 'x', label: 'X' });
    expect(Object.isFrozen(m)).toBe(true);
    expect(Object.isFrozen(m.defaultSize)).toBe(true);
  });
});

describe('deriveManifestEntry', () => {
  test('produces the shape windowManifest.js consumes', () => {
    const e = deriveManifestEntry({
      kind: 'notes',
      label: 'Notes',
      defaultSize: { w: 400, h: 300 },
    });
    expect(e).toEqual({
      kind: 'notes',
      canvasType: 'notes',
      label: 'Notes',
      componentName: 'NotesWindow',
      componentPath: 'src/components/NotesWindow.jsx',
      defaultSize: { w: 400, h: 300 },
      moduleMenu: { show: false, status: 'prototype' },
    });
  });

  test('uses an explicit componentPath and carries the lab fixture through', () => {
    const e = deriveManifestEntry({
      kind: 'notes',
      label: 'Notes',
      componentPath: 'src/components/windows/notes/index.jsx',
      lab: { title: 'Notes', props: { note: 'hi' } },
    });
    expect(e.componentPath).toBe('src/components/windows/notes/index.jsx');
    expect(e.lab).toEqual({ title: 'Notes', props: { note: 'hi' } });
  });
});

describe('deriveRegistryEntry', () => {
  test('produces the shape windowRegistry.js consumes', () => {
    const e = deriveRegistryEntry({
      kind: 'notes',
      label: 'Notes',
      defaultSize: { w: 400, h: 300 },
    });
    expect(e).toEqual({
      componentKey: 'NotesWindow',
      defaultSize: { w: 400, h: 300 },
      title: 'Notes',
      canPin: true,
      canSpawnFromRegion: true,
      persistence: 'workspace',
      entitlement: 'windows.notes',
      modeAvailability: { local_desktop: true, private_server: true, cloud_saas: true },
      installScope: 'workspace',
      runtimeAffinity: 'browser',
      requiredCapabilities: [],
      sideEffects: [],
      artifactTypes: [],
    });
  });
});

describe('selectNewMetas', () => {
  test('returns only metas whose kind is not already seeded', () => {
    const metas = [
      { kind: 'a', label: 'A' },
      { kind: 'b', label: 'B' },
      { kind: 'c', label: 'C' },
    ];
    const out = selectNewMetas(metas, ['b']);
    expect(out.map((m) => m.kind)).toEqual(['a', 'c']);
  });

  test('dedupes repeated kinds within the discovered set', () => {
    const metas = [
      { kind: 'a', label: 'A' },
      { kind: 'a', label: 'A again' },
    ];
    const out = selectNewMetas(metas, []);
    expect(out.map((m) => m.kind)).toEqual(['a']);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: the reference folder window must be wired into both central
// records, and those records must match what the meta derives. This is the
// guarantee the whole factory rests on.
// ---------------------------------------------------------------------------
describe('helloFactory reference window is fully synced', () => {
  test('manifest entry matches the derived shape', () => {
    const derived = deriveManifestEntry(helloFactoryMeta);
    expect(WINDOW_MANIFEST_BY_KIND.helloFactory).toMatchObject({
      kind: 'helloFactory',
      canvasType: derived.canvasType,
      label: derived.label,
      componentName: derived.componentName,
      componentPath: derived.componentPath,
      defaultSize: derived.defaultSize,
    });
  });

  test('registry entry matches the derived shape', () => {
    const derived = deriveRegistryEntry(helloFactoryMeta);
    expect(WINDOW_REGISTRY.helloFactory).toMatchObject(derived);
  });

  test('component path points at the co-located folder module', () => {
    expect(WINDOW_MANIFEST_BY_KIND.helloFactory.componentPath).toBe(
      'src/components/windows/helloFactory/index.jsx',
    );
  });
});

/**
 * tests/windowAllowList.test.js
 *
 * Brief B1 — `.team/handoffs/2026-06-23-b1-window-allow-list.md`.
 *
 * Asserts:
 *   1. `getDefaultAllowList()` returns `{ [kind]: false }` for every kind
 *      in WINDOW_MANIFEST_BY_KIND.
 *   2. `migrateWorkspace({})` returns a back-compat all-true workspace.
 *   3. `migrateWorkspace({ windowAllowList: { chat: true } })` preserves
 *      user choices.
 *   4. `isWindowAllowed` and `setWindowAllowed` round-trip correctly.
 *   5. `withAllowList` strips the allow-list when it equals the default.
 *   6. `filterAllowedWindows` gates windows by the workspace's allow-list.
 *   7. The migration flag (`__allowListMigratedFromLegacy`) is set on
 *      legacy and customized workspaces, NOT on fresh post-B1 saves.
 */
import {
  getDefaultAllowList,
  getAllTrueAllowList,
  migrateWorkspace,
  isWindowAllowed,
  setWindowAllowed,
  withAllowList,
  filterAllowedWindows,
  MIGRATION_FLAG_KEY,
} from '../src/lib/workspace/allowList.js';
import { WINDOW_MANIFEST_BY_KIND } from '../src/lib/windowManifest.js';

describe('Brief B1 - Window allow-list (default + helpers)', () => {
  test('getDefaultAllowList() has every kind in WINDOW_MANIFEST_BY_KIND set to false', () => {
    const def = getDefaultAllowList();
    const kinds = Object.keys(WINDOW_MANIFEST_BY_KIND);
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) {
      expect(def).toHaveProperty(kind);
      expect(def[kind]).toBe(false);
    }
    // The default has exactly the manifest kinds (no extras).
    expect(Object.keys(def).sort()).toEqual(kinds.sort());
  });

  test('getAllTrueAllowList() has every kind set to true', () => {
    const all = getAllTrueAllowList();
    for (const kind of Object.keys(WINDOW_MANIFEST_BY_KIND)) {
      expect(all[kind]).toBe(true);
    }
  });

  test('isWindowAllowed respects explicit true / false and missing kinds', () => {
    const ws = { windowAllowList: { chat: true, agent: false, terminal: true } };
    expect(isWindowAllowed(ws, 'chat')).toBe(true);
    expect(isWindowAllowed(ws, 'agent')).toBe(false);
    expect(isWindowAllowed(ws, 'terminal')).toBe(true);
    // Unknown kind defaults to false (closed by default).
    expect(isWindowAllowed(ws, 'unknown')).toBe(false);
    // No allowList at all → false.
    expect(isWindowAllowed({}, 'chat')).toBe(false);
    expect(isWindowAllowed(null, 'chat')).toBe(false);
  });

  test('setWindowAllowed returns a new workspace with the flag set', () => {
    const base = { wins: [1, 2], windowAllowList: { chat: false } };
    const next = setWindowAllowed(base, 'chat', true);
    expect(next.windowAllowList.chat).toBe(true);
    expect(next.wins).toEqual([1, 2]);
    // The original is not mutated.
    expect(base.windowAllowList.chat).toBe(false);
  });

  test('setWindowAllowed on a workspace with no allow-list seeds an empty one', () => {
    const next = setWindowAllowed({}, 'chat', true);
    expect(next.windowAllowList).toEqual({ chat: true });
  });

  test('setWindowAllowed + isWindowAllowed round-trip', () => {
    const base = {};
    const a = setWindowAllowed(base, 'chat', true);
    expect(isWindowAllowed(a, 'chat')).toBe(true);
    const b = setWindowAllowed(a, 'chat', false);
    expect(isWindowAllowed(b, 'chat')).toBe(false);
  });

  test('withAllowList strips the field when every kind matches the default', () => {
    const def = getDefaultAllowList();
    const ws = { wins: [], windowAllowList: { ...def } };
    const stripped = withAllowList(ws);
    expect(stripped.windowAllowList).toBeUndefined();
    expect(stripped.wins).toEqual([]);
  });

  test('withAllowList keeps the field when any kind is non-default', () => {
    const def = getDefaultAllowList();
    const custom = { ...def, chat: true };
    const ws = { wins: [], windowAllowList: custom };
    const kept = withAllowList(ws);
    expect(kept.windowAllowList).toEqual(custom);
  });

  test('withAllowList passes through workspaces without an allow-list', () => {
    const ws = { wins: [] };
    expect(withAllowList(ws)).toEqual(ws);
    expect(withAllowList(null)).toEqual({});
  });

  test('filterAllowedWindows drops blocked kinds, keeps allowed kinds', () => {
    const wins = [
      { id: 'a', kind: 'chat' },
      { id: 'b', kind: 'agent' },
      { id: 'c', kind: 'terminal' },
      { id: 'd' }, // no kind — dropped
    ];
    const ws = { windowAllowList: { chat: true, agent: false, terminal: true } };
    const filtered = filterAllowedWindows(wins, ws);
    expect(filtered.map((w) => w.id)).toEqual(['a', 'c']);
  });

  test('filterAllowedWindows returns [] for a workspace without an allow-list', () => {
    expect(filterAllowedWindows([{ id: 'a', kind: 'chat' }], {})).toEqual([]);
    expect(filterAllowedWindows([{ id: 'a', kind: 'chat' }], null)).toEqual([]);
  });

  test('filterAllowedWindows accepts non-array input gracefully', () => {
    expect(filterAllowedWindows(null, { windowAllowList: { chat: true } })).toEqual([]);
    expect(filterAllowedWindows(undefined, { windowAllowList: { chat: true } })).toEqual([]);
  });
});

describe('Brief B1 - migrateWorkspace back-compat', () => {
  test('legacy workspace (no windowAllowList) → migrated to all-true', () => {
    const out = migrateWorkspace({ wins: [1, 2] });
    expect(out.wins).toEqual([1, 2]);
    // Every manifest kind set to true.
    for (const kind of Object.keys(WINDOW_MANIFEST_BY_KIND)) {
      expect(out.windowAllowList[kind]).toBe(true);
    }
    expect(out[MIGRATION_FLAG_KEY]).toBe(true);
  });

  test('empty input ({}) → migrated to all-true + migration flag', () => {
    const out = migrateWorkspace({});
    expect(out.windowAllowList).toBeDefined();
    for (const kind of Object.keys(WINDOW_MANIFEST_BY_KIND)) {
      expect(out.windowAllowList[kind]).toBe(true);
    }
    expect(out[MIGRATION_FLAG_KEY]).toBe(true);
  });

  test('null / undefined input → returns { windowAllowList: all-true }', () => {
    const out = migrateWorkspace(null);
    expect(out.windowAllowList).toBeDefined();
    expect(out[MIGRATION_FLAG_KEY]).toBe(true);
  });

  test('post-B1 workspace with { chat: true } → preserved as-is + migration flag', () => {
    const out = migrateWorkspace({ windowAllowList: { chat: true } });
    expect(out.windowAllowList).toEqual({ chat: true });
    expect(out[MIGRATION_FLAG_KEY]).toBe(true);
  });

  test('post-B1 workspace with explicit allow-list (including false flags) → preserved', () => {
    const out = migrateWorkspace({
      windowAllowList: { chat: true, agent: false, terminal: true },
    });
    expect(out.windowAllowList).toEqual({
      chat: true,
      agent: false,
      terminal: true,
    });
    expect(out[MIGRATION_FLAG_KEY]).toBe(true);
  });

  test('fresh post-B1 workspace with empty allow-list {} → kept as-is, no migration flag', () => {
    // An empty object means "post-B1 save with no windows enabled yet" — the
    // user explicitly chose to start empty. Don't back-fill with all-true.
    const out = migrateWorkspace({ windowAllowList: {} });
    expect(out.windowAllowList).toEqual({});
    expect(out[MIGRATION_FLAG_KEY]).toBeUndefined();
  });

  test('migrateWorkspace is PURE — does not mutate the input', () => {
    const input = { wins: [1, 2] };
    const snapshot = JSON.stringify(input);
    migrateWorkspace(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
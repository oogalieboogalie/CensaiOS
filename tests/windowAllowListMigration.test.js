/**
 * tests/windowAllowListMigration.test.js
 *
 * Brief B1 — `.team/handoffs/2026-06-23-b1-window-allow-list.md`.
 *
 * Back-compat scenarios per the brief: workspaces saved BEFORE this brief
 * (no `windowAllowList` field) must still render their existing windows
 * after migration. The brief lists four specific scenarios; this file
 * covers them plus a few edge cases.
 *
 *   1. Workspace with no `windowAllowList` field.
 *   2. Workspace with `windowAllowList = {}`.
 *   3. Workspace with `windowAllowList = { chat: true, all others absent }`.
 *   4. Workspace with `windowAllowList = { chat: true, all others: false }`.
 *
 * Plus: the migration flag is correct for each scenario, the filter
 * helper lets through the right windows after migration, and the
 * `withAllowList` finalizer preserves the user's choices.
 */
import {
  isWindowAllowed,
  withAllowList,
  filterAllowedWindows,
  MIGRATION_FLAG_KEY,
  migrateWorkspace,
} from '../src/lib/workspace/allowList.js';
import { WINDOW_MANIFEST_BY_KIND } from '../src/lib/windowManifest.js';

// Helper: pick a few representative kinds for fixtures. Use specific
// known kinds so the test isn't sensitive to whatever happens to be
// at index 0/1/2 of WINDOW_MANIFEST_BY_KIND's iteration order.
const ALL_KINDS = Object.keys(WINDOW_MANIFEST_BY_KIND);
const CHAT = ALL_KINDS.includes('chat') ? 'chat' : ALL_KINDS[0];
const AGENT = ALL_KINDS.includes('agent') ? 'agent' : ALL_KINDS.find((k) => k !== CHAT);
const TERMINAL = ALL_KINDS.includes('terminal') ? 'terminal' : ALL_KINDS.find((k) => k !== CHAT && k !== AGENT);

const SAMPLE_WINDOWS = [
  { id: 'w1', kind: CHAT },
  { id: 'w2', kind: AGENT },
  { id: 'w3', kind: TERMINAL },
];

describe('Brief B1 - migration scenarios', () => {
  describe('scenario 1: legacy workspace (no windowAllowList field)', () => {
    const legacy = {
      wins: SAMPLE_WINDOWS,
      canvasGroups: [],
      paths: [],
      links: [],
    };
    const migrated = migrateWorkspace(legacy);

    test('migrates to all-true so existing canvas is preserved', () => {
      for (const kind of Object.keys(WINDOW_MANIFEST_BY_KIND)) {
        expect(migrated.windowAllowList[kind]).toBe(true);
      }
    });

    test('sets the migration flag so consumers know this came from a pre-B1 save', () => {
      expect(migrated[MIGRATION_FLAG_KEY]).toBe(true);
    });

    test('preserves the wins and other workspace state', () => {
      expect(migrated.wins).toEqual(SAMPLE_WINDOWS);
      expect(migrated.canvasGroups).toEqual([]);
      expect(migrated.paths).toEqual([]);
      expect(migrated.links).toEqual([]);
    });

    test('every window is allowed after migration', () => {
      for (const win of SAMPLE_WINDOWS) {
        expect(isWindowAllowed(migrated, win.kind)).toBe(true);
      }
      expect(filterAllowedWindows(SAMPLE_WINDOWS, migrated)).toEqual(SAMPLE_WINDOWS);
    });
  });

  describe('scenario 2: post-B1 workspace with empty allow-list {}', () => {
    // Fresh post-B1 save with no enabled windows yet. The user explicitly
    // chose to start empty — preserve that choice (don't back-fill all-true).
    const fresh = {
      wins: [],
      windowAllowList: {},
    };
    const migrated = migrateWorkspace(fresh);

    test('keeps the empty allow-list as-is', () => {
      expect(migrated.windowAllowList).toEqual({});
    });

    test('does NOT set the migration flag (this is a fresh save, not a legacy one)', () => {
      expect(migrated[MIGRATION_FLAG_KEY]).toBeUndefined();
    });

    test('no windows pass the filter', () => {
      expect(filterAllowedWindows(SAMPLE_WINDOWS, migrated)).toEqual([]);
    });

    test('withAllowList strips the empty allow-list (matches default)', () => {
      const stripped = withAllowList(migrated);
      expect(stripped.windowAllowList).toBeUndefined();
    });
  });

  describe('scenario 3: post-B1 with { chat: true, all others absent }', () => {
    // User opted-in to one window. The migration should preserve their
    // choice and add the migration flag so a future brief knows the
    // workspace came from a customized save.
    const partial = {
      wins: SAMPLE_WINDOWS,
      windowAllowList: { [CHAT]: true },
    };
    const migrated = migrateWorkspace(partial);

    test('preserves the user\'s chat: true choice', () => {
      expect(migrated.windowAllowList[CHAT]).toBe(true);
    });

    test('sets the migration flag (customized = flag set)', () => {
      expect(migrated[MIGRATION_FLAG_KEY]).toBe(true);
    });

    test('only chat windows pass the filter; agent and terminal are blocked', () => {
      const filtered = filterAllowedWindows(SAMPLE_WINDOWS, migrated);
      expect(filtered.map((w) => w.id)).toEqual(['w1']);
    });

    test('withAllowList keeps the non-default field (chat is true, others absent ≠ default)', () => {
      const kept = withAllowList(migrated);
      expect(kept.windowAllowList).toBeDefined();
      expect(kept.windowAllowList[CHAT]).toBe(true);
    });
  });

  describe('scenario 4: post-B1 with { chat: true, all others: false }', () => {
    // Full B1-shaped save: explicit per-kind choices, every other kind
    // explicitly false. This is the canonical post-B1 state for a user
    // who has used the marketplace (B2) to opt in to chat.
    const full = {
      wins: SAMPLE_WINDOWS,
      windowAllowList: (() => {
        const out = { [CHAT]: true };
        for (const kind of Object.keys(WINDOW_MANIFEST_BY_KIND)) {
          if (kind !== CHAT) out[kind] = false;
        }
        return out;
      })(),
    };
    const migrated = migrateWorkspace(full);

    test('preserves the full allow-list shape', () => {
      expect(migrated.windowAllowList[CHAT]).toBe(true);
      for (const kind of Object.keys(WINDOW_MANIFEST_BY_KIND)) {
        if (kind !== CHAT) expect(migrated.windowAllowList[kind]).toBe(false);
      }
    });

    test('sets the migration flag (customized = flag set)', () => {
      expect(migrated[MIGRATION_FLAG_KEY]).toBe(true);
    });

    test('only chat passes the filter', () => {
      const filtered = filterAllowedWindows(SAMPLE_WINDOWS, migrated);
      expect(filtered.map((w) => w.id)).toEqual(['w1']);
    });
  });

  describe('scenario: legacy workspace with extra fields preserved', () => {
    // Make sure the migration doesn't strip unrelated workspace state
    // (sidebarFavorites, presets, dockOffset, etc.).
    const legacyWithExtras = {
      wins: SAMPLE_WINDOWS,
      sidebarFavorites: ['a', 'b', 'c'],
      presets: [{ id: 'p1', name: 'My Setup' }],
      dockOffset: 42,
      focusMode: true,
      workspaceId: 'ws-12345',
    };
    const migrated = migrateWorkspace(legacyWithExtras);

    test('every extra field is preserved through the migration', () => {
      expect(migrated.sidebarFavorites).toEqual(['a', 'b', 'c']);
      expect(migrated.presets).toEqual([{ id: 'p1', name: 'My Setup' }]);
      expect(migrated.dockOffset).toBe(42);
      expect(migrated.focusMode).toBe(true);
      expect(migrated.workspaceId).toBe('ws-12345');
    });
  });

  describe('scenario: idempotent migration', () => {
    // Running migrateWorkspace twice should produce the same result. A
    // post-B1 workspace doesn't get re-flagged on the second pass.
    const partial = {
      wins: SAMPLE_WINDOWS,
      windowAllowList: { [CHAT]: true },
    };
    const once = migrateWorkspace(partial);
    const twice = migrateWorkspace(once);

    test('a second migration pass preserves the same allow-list', () => {
      expect(twice.windowAllowList).toEqual(once.windowAllowList);
    });

    test('the migration flag is set on both passes (idempotent — flag stays true)', () => {
      expect(twice[MIGRATION_FLAG_KEY]).toBe(true);
    });

    test('a fresh-post-B1 empty allowList is NOT re-flipped on a second pass', () => {
      const fresh = { windowAllowList: {} };
      const a = migrateWorkspace(fresh);
      const b = migrateWorkspace(a);
      expect(b.windowAllowList).toEqual({});
      expect(b[MIGRATION_FLAG_KEY]).toBeUndefined();
    });
  });
});
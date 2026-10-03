/**
 * @jest-environment jsdom
 */
import {
  GROUP_HOTKEY_SLOTS,
  loadGroupHotkeys,
  saveGroupHotkeys,
  resolveAssignTarget,
  groupForSlot,
  pruneBindings,
  invertBindings,
  groupMembers,
} from '../src/lib/groupHotkeys.js';

describe('group hotkeys (AoE control groups)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('slots are the digits 1-9', () => {
    expect(GROUP_HOTKEY_SLOTS).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });

  test('bindings round-trip per workspace without leaking across workspaces', () => {
    saveGroupHotkeys('ws-a', { 1: 'g1', 2: 'g2' });
    saveGroupHotkeys('ws-b', { 1: 'g9' });
    expect(loadGroupHotkeys('ws-a')).toEqual({ 1: 'g1', 2: 'g2' });
    expect(loadGroupHotkeys('ws-b')).toEqual({ 1: 'g9' });
    expect(loadGroupHotkeys('ws-missing')).toEqual({});
  });

  test('only valid slots persist; junk is dropped', () => {
    saveGroupHotkeys('ws-a', { 1: 'g1', 0: 'nope', F1: 'nope', 10: 'nope' });
    expect(loadGroupHotkeys('ws-a')).toEqual({ 1: 'g1' });
  });

  test('assign target is the active window group, or null', () => {
    const wins = [
      { id: 'a', groupId: 'g1' },
      { id: 'b', groupId: null },
    ];
    expect(resolveAssignTarget(wins, 'a')).toBe('g1');
    expect(resolveAssignTarget(wins, 'b')).toBeNull();
    expect(resolveAssignTarget(wins, 'ghost')).toBeNull();
    expect(resolveAssignTarget(wins, null)).toBeNull();
  });

  test('slot resolves to the live group, or null when stale', () => {
    const groups = [{ id: 'g1' }, { id: 'g2' }];
    expect(groupForSlot(groups, { 1: 'g1' }, '1')).toBe(groups[0]);
    expect(groupForSlot(groups, { 1: 'gone' }, '1')).toBeNull();
    expect(groupForSlot(groups, {}, '1')).toBeNull();
  });

  test('prune drops bindings for deleted groups only', () => {
    const groups = [{ id: 'g1' }];
    expect(pruneBindings({ 1: 'g1', 2: 'gone' }, groups)).toEqual({ 1: 'g1' });
  });

  test('invert maps groupId back to slot for badges', () => {
    expect(invertBindings({ 1: 'g1', 3: 'g3' })).toEqual({ g1: '1', g3: '3' });
  });

  test('members are explicit members plus center-inside windows', () => {
    const group = { id: 'g1', x: 0, y: 0, w: 400, h: 400 };
    const wins = [
      // Explicit member whose center drifted outside still counts.
      { id: 'member', groupId: 'g1', x: 500, y: 500, w: 100, h: 100 },
      { id: 'inside', x: 50, y: 50, w: 100, h: 100 },
      { id: 'outside', x: 900, y: 900, w: 100, h: 100 },
    ];
    const ids = groupMembers(wins, group).map((w) => w.id).sort();
    expect(ids).toEqual(['inside', 'member']);
    expect(groupMembers(wins, null)).toEqual([]);
  });
});

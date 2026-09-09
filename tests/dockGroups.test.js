import { DEFAULT_GROUPS, reconcileDockGroups } from '../src/lib/dockDefaults.js';

describe('reconcileDockGroups', () => {
  test('drops deleted agents and seats phoenix on the core team', () => {
    const groups = [{
      id: 'core', name: 'Core Team', hue: 5,
      agentIds: ['architect', 'nemo', 'atlas-1', 'atlas'],
    }];
    const out = reconcileDockGroups(groups, DEFAULT_GROUPS[0].agentIds);
    expect(out[0].agentIds).toEqual(['architect', 'atlas', 'phoenix']);
  });

  test('leaves custom groups alone except for dead ids', () => {
    const groups = [{ id: 'x', name: 'Mine', agentIds: ['atlas', 'nemo-2'] }];
    const out = reconcileDockGroups(groups, ['atlas', 'phoenix']);
    expect(out[0]).toMatchObject({ id: 'x', agentIds: ['atlas'] });
  });

  test('returns the same reference when nothing changes', () => {
    const groups = [{ id: 'core', name: 'Core Team', agentIds: ['atlas', 'phoenix'] }];
    expect(reconcileDockGroups(groups, ['atlas', 'phoenix'])[0]).toBe(groups[0]);
  });

  test('seat-once flag respects a deliberate removal', () => {
    const groups = [{ id: 'core', name: 'Core Team', agentIds: ['atlas'] }];
    const out = reconcileDockGroups(groups, ['atlas', 'phoenix'], { seatPhoenix: false });
    expect(out[0].agentIds).toEqual(['atlas']);
  });

  test('handles empty input', () => {
    expect(reconcileDockGroups(null, [])).toEqual([]);
  });
});

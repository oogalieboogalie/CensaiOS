import { resolveScheduledAssignee, resolveScheduledAssigneeId } from './schedulerWorker.js';

describe('resolveScheduledAssigneeId', () => {
  const subAgents = [
    { id: 'jules-architect', name: 'Jules' },
    { id: 'atlas-architect', name: 'Atlas' },
  ];

  test('preserves persisted sub-agent ids', () => {
    expect(resolveScheduledAssigneeId('jules-architect', subAgents)).toBe('jules-architect');
  });

  test('maps scheduler aliases to matching sub-agent names', () => {
    expect(resolveScheduledAssigneeId('jules', subAgents)).toBe('jules-architect');
    expect(resolveScheduledAssigneeId('atlas', subAgents)).toBe('atlas-architect');
  });

  test('returns null when no active sub-agent matches', () => {
    expect(resolveScheduledAssigneeId('foundation', subAgents)).toBeNull();
  });

  test('prefers an exact core family agent over a similarly named sub-agent', () => {
    expect(resolveScheduledAssignee('atlas', [{ id: 'atlas', name: 'Atlas' }], subAgents))
      .toEqual({ kind: 'core_agent', id: 'atlas' });
  });
});

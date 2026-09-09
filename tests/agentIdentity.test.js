import { FAMILY_AGENT_IDS } from '../src/data/family-agents.js';
import { betaVisibleAgents, classifyAgentIdentity } from '../server/agents/identity.js';

describe('canonical agent identity contract', () => {
  test('maps every family agent to one stable card identity', () => {
    for (const id of FAMILY_AGENT_IDS) {
      expect(classifyAgentIdentity({ id, name: id })).toEqual({
        class: 'family',
        betaVisible: true,
        canonicalId: id,
        cardId: `agent:${id}`,
      });
    }
  });

  test('labels development, duplicate, and unregistered rows without deleting them', () => {
    expect(classifyAgentIdentity({ id: 'test_n6nazz8a', name: 'test' }).class).toBe('development');
    expect(classifyAgentIdentity({ id: 'atlas-1', name: 'Atlas' })).toMatchObject({
      class: 'duplicate', canonicalId: 'atlas', betaVisible: false,
    });
    expect(classifyAgentIdentity({ id: 'guardian', name: 'Guardian' }).class).toBe('unregistered');
  });

  test('returns only canonical family rows for beta discovery', () => {
    const rows = [{ id: 'atlas', name: 'Atlas' }, { id: 'atlas-1', name: 'Atlas' }, { id: 'guardian', name: 'Guardian' }];
    expect(betaVisibleAgents(rows).map((agent) => agent.id)).toEqual(['atlas']);
    expect(rows).toHaveLength(3);
  });
});

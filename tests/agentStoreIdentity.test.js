import { jest } from '@jest/globals';

const getAgentsFromApi = jest.fn().mockResolvedValue([
  { id: 'atlas', name: 'Atlas Prime', identity: { class: 'family', betaVisible: true } },
  { id: 'atlas-1', name: 'Atlas', identity: { class: 'duplicate', betaVisible: false } },
  { id: 'guardian', name: 'Guardian', identity: { class: 'unregistered', betaVisible: false } },
]);

jest.unstable_mockModule('../src/lib/api.js', () => ({
  api: { getAgents: getAgentsFromApi },
}));

const { getAgents, initializeAgents } = await import('../src/lib/agentStore.js');

describe('agent store identity boundary', () => {
  test('merges canonical family data but excludes classified non-beta rows', async () => {
    await initializeAgents();
    expect(getAgents().find((agent) => agent.id === 'atlas')).toMatchObject({ name: 'Atlas Prime' });
    expect(getAgents().some((agent) => agent.id === 'atlas-1')).toBe(false);
    expect(getAgents().some((agent) => agent.id === 'guardian')).toBe(false);
  });
});

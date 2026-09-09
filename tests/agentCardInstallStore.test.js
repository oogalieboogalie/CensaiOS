import { jest } from '@jest/globals';
import {
  installAgentCard,
  listAgentCardInstalls,
  removeAgentCardInstall,
} from '../server/agent-registry/installStore.js';

function database({ existing = false, foreign = false } = {}) {
  const calls = [];
  const client = {
    release: jest.fn(),
    query: jest.fn(async (sql, params = []) => {
      const text = String(sql); calls.push({ text, params });
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return { rows: [] };
      if (text.includes('FROM workspaces w')) return { rows: [{ id: 'ws-a', name: 'A', role: 'owner' }] };
      if (text.includes('SELECT * FROM agent_cards')) return { rows: [{
        id: 'agent:architect', visibility: foreign ? 'workspace' : 'public',
        owner_id: foreign ? '9' : null, workspace_id: foreign ? 'ws-b' : null,
      }] };
      if (text.includes('SELECT workspace_id FROM workspace_members')) return { rows: [{ workspace_id: 'ws-a' }] };
      if (text.includes('INSERT INTO workspace_agent_card_installs')) return { rows: existing ? [] : [{
        workspace_id: 'ws-a', card_id: 'agent:architect', installed_by_user_id: 7,
      }] };
      if (text.includes('SELECT * FROM workspace_agent_card_installs')) return { rows: [{
        workspace_id: 'ws-a', card_id: 'agent:architect', installed_by_user_id: 7,
      }] };
      if (text.includes('DELETE FROM workspace_agent_card_installs')) return { rows: existing ? [] : [{
        workspace_id: 'ws-a', card_id: 'agent:architect', installed_by_user_id: 7,
      }] };
      if (text.includes('INSERT INTO workspace_events')) return { rows: [{ id: 'event-1' }] };
      if (text.includes('FROM workspace_agent_card_installs i')) return { rows: [{ card_id: 'agent:architect' }] };
      throw new Error(`Unexpected query: ${text}`);
    }),
  };
  return { db: { connect: async () => client, query: client.query }, client, calls };
}

test('list derives member scope and returns management policy', async () => {
  const { db } = database();
  await expect(listAgentCardInstalls(db, { workspaceId: 'ws-a', userId: 7 })).resolves.toEqual({
    canManage: true, items: [{ card_id: 'agent:architect' }],
  });
});

test('first install writes one attributed event and repeat is idempotent', async () => {
  const first = database();
  await expect(installAgentCard(first.db, {
    workspaceId: 'ws-a', userId: 7, cardId: 'agent:architect',
  })).resolves.toMatchObject({ created: true });
  expect(first.calls.filter(call => call.text.includes('INSERT INTO workspace_events'))).toHaveLength(1);

  const repeat = database({ existing: true });
  await expect(installAgentCard(repeat.db, {
    workspaceId: 'ws-a', userId: 7, cardId: 'agent:architect',
  })).resolves.toMatchObject({ created: false });
  expect(repeat.calls.some(call => call.text.includes('INSERT INTO workspace_events'))).toBe(false);
});

test('foreign non-public card is hidden before persistence', async () => {
  const probe = database({ foreign: true });
  await expect(installAgentCard(probe.db, {
    workspaceId: 'ws-a', userId: 7, cardId: 'foreign',
  })).rejects.toMatchObject({ statusCode: 404, code: 'AGENT_CARD_NOT_FOUND' });
  expect(probe.calls.some(call => call.text.includes('INSERT INTO workspace_agent_card_installs'))).toBe(false);
});

test('remove emits only on a real transition', async () => {
  const first = database();
  await expect(removeAgentCardInstall(first.db, {
    workspaceId: 'ws-a', userId: 7, cardId: 'agent:architect',
  })).resolves.toMatchObject({ removed: true });
  const repeat = database({ existing: true });
  await expect(removeAgentCardInstall(repeat.db, {
    workspaceId: 'ws-a', userId: 7, cardId: 'agent:architect',
  })).resolves.toMatchObject({ removed: false });
  expect(repeat.calls.some(call => call.text.includes('INSERT INTO workspace_events'))).toBe(false);
});

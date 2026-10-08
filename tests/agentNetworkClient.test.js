import { jest } from '@jest/globals';
import { createAgentNetworkClient } from '../src/lib/agentRegistry/networkClient.js';
import { parseSkillInput } from '../src/components/registry/skillInput.js';

function ok(body, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

test('network client scopes every call to the workspace', async () => {
  const fetch = jest.fn(async () => ok({ items: [] }));
  const client = createAgentNetworkClient({ fetch, workspaceId: 'ws a' });
  await client.discoverAgents({ query: 'sql help', tags: ['db', 'pg'] });
  await client.listHelpRequests();
  await client.requestHelp({ cardId: 'agent:nexus', task: 't', skillId: '', onBehalfOf: 'atlas' });
  await client.decideHelpRequest('id/1', 'accept', 'ok');
  await client.cancelHelpRequest('id2');
  const urls = fetch.mock.calls.map(([url]) => url);
  expect(urls[0]).toBe('/api/agent-registry/discover?workspaceId=ws+a&q=sql+help&limit=12&tags=db%2Cpg');
  expect(urls[1]).toBe('/api/agent-registry/help-requests?workspaceId=ws%20a');
  expect(urls.slice(2)).toEqual([
    '/api/agent-registry/help-requests',
    '/api/agent-registry/help-requests/id%2F1/decision',
    '/api/agent-registry/help-requests/id2/cancel',
  ]);
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ cardId: 'agent:nexus', task: 't', onBehalfOf: 'atlas', workspaceId: 'ws a' });
  expect(JSON.parse(fetch.mock.calls[3][1].body)).toEqual({ decision: 'accept', note: 'ok', workspaceId: 'ws a' });
});

test('server errors surface their message and code', async () => {
  const fetch = jest.fn(async () => ok({ error: 'Pin it first.', code: 'AGENT_HELP_PIN_REQUIRED' }, 403));
  const client = createAgentNetworkClient({ fetch, workspaceId: 'ws' });
  await expect(client.requestHelp({ cardId: 'x', task: 't' })).rejects.toMatchObject({
    message: 'Pin it first.', status: 403, code: 'AGENT_HELP_PIN_REQUIRED',
  });
  expect(() => createAgentNetworkClient({ fetch })).toThrow(/workspaceId/);
});

test('skill input turns #tags into advertised skill tags and dedupes names', () => {
  expect(parseSkillInput('Write Migration #Database #sql #sql, summarize, write migration, #orphan, '))
    .toEqual([
      { id: 'write-migration', name: 'Write Migration', tags: ['database', 'sql'] },
      { id: 'summarize', name: 'summarize', tags: [] },
    ]);
});

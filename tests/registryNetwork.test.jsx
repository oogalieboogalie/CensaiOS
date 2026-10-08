/**
 * @jest-environment jsdom
 */
// eslint-disable-next-line no-unused-vars
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { jest } from '@jest/globals';
// eslint-disable-next-line no-unused-vars
import { NetworkTab } from '../src/components/registry/NetworkTab.jsx';

const nexus = {
  cardId: 'agent:nexus', name: 'Nexus', description: 'Database custodian', score: 16,
  matchedSkills: [{ id: 'write-migration', name: 'Write migration', tags: ['database'] }],
  skills: [{ id: 'schema-design', name: 'Design schema' }, { id: 'write-migration', name: 'Write migration' }],
  installed: false, callable: true, executorKind: 'builtin', acceptsRequests: true, approval: 'auto',
};
const theirs = {
  cardId: 'ext:n8n:theirs', name: 'Their bot', description: 'Remote', score: 3, matchedSkills: [], skills: [],
  installed: false, callable: true, executorKind: 'n8n_chat', acceptsRequests: true, approval: 'owner',
};
const cardOnly = { ...theirs, cardId: 'ext:7:card', name: 'Card only', callable: false, executorKind: null };

function makeClient() {
  let outgoing = [];
  const incoming = [{
    id: 'in-1', side: 'incoming', cardId: 'ext:7:mine', cardName: 'My bot', task: 'Summarize this',
    requester: { kind: 'agent', id: 'echo' }, status: 'pending', result: null, createdAt: '2026-10-03T20:00:00Z',
  }];
  return {
    discoverAgents: jest.fn(async ({ query }) => ({ items: query === 'nothing' ? [] : [nexus, theirs, cardOnly] })),
    listHelpRequests: jest.fn(async () => ({ outgoing, incoming })),
    requestHelp: jest.fn(async (input) => {
      const created = {
        id: `out-${outgoing.length + 1}`, side: 'outgoing', cardId: input.cardId, cardName: 'Nexus',
        skillId: input.skillId, task: input.task, requester: input.onBehalfOf ? { kind: 'agent', id: input.onBehalfOf } : { kind: 'user', id: '7' },
        status: 'completed', result: 'CREATE INDEX CONCURRENTLY idx ON t (c);', createdAt: '2026-10-03T20:01:00Z',
      };
      outgoing = [created, ...outgoing];
      return created;
    }),
    decideHelpRequest: jest.fn(async (id, decision) => {
      incoming[0] = { ...incoming[0], status: decision === 'accept' ? 'queued' : 'declined' };
      return incoming[0];
    }),
    cancelHelpRequest: jest.fn(),
  };
}

test('discovers agents with match badges and blocks card-only agents', async () => {
  const client = makeClient();
  render(<NetworkTab client={client} />);
  const rows = await screen.findAllByTestId('network-candidate');
  expect(rows.map((row) => row.getAttribute('data-card-id'))).toEqual(['agent:nexus', 'ext:n8n:theirs', 'ext:7:card']);
  expect(within(rows[0]).getByText('runs now')).toBeTruthy();
  expect(within(rows[1]).getByText('owner approves')).toBeTruthy();
  expect(within(rows[2]).getByText('card only')).toBeTruthy();
  expect(within(rows[2]).getByTestId('network-ask').disabled).toBe(true);

  fireEvent.change(screen.getByTestId('network-query'), { target: { value: 'nothing' } });
  fireEvent.change(screen.getByTestId('network-tags'), { target: { value: 'sql, postgres' } });
  fireEvent.submit(screen.getByTestId('network-search'));
  await screen.findByTestId('network-empty');
  expect(client.discoverAgents).toHaveBeenLastCalledWith({ query: 'nothing', tags: ['sql', 'postgres'] });
});

test('asking an agent sends the task, skill and requester, then shows the result', async () => {
  const client = makeClient();
  render(<NetworkTab client={client} />);
  const [row] = await screen.findAllByTestId('network-candidate');
  fireEvent.click(within(row).getByTestId('network-ask'));
  expect(within(row).getByTestId('network-request-skill').value).toBe('write-migration');
  fireEvent.change(within(row).getByTestId('network-request-task'), { target: { value: 'Add an index on t.c' } });
  fireEvent.change(within(row).getByTestId('network-request-as'), { target: { value: 'atlas' } });
  expect(within(row).queryByRole('option', { name: /Nexus/ })).toBeNull();
  fireEvent.click(within(row).getByTestId('network-request-send'));

  await waitFor(() => expect(client.requestHelp).toHaveBeenCalledWith({
    cardId: 'agent:nexus', task: 'Add an index on t.c', skillId: 'write-migration', onBehalfOf: 'atlas',
  }));
  const sent = await screen.findByTestId('network-outgoing-row');
  expect(within(sent).getByTestId('network-status').textContent).toBe('completed');
  expect(within(sent).getByTestId('network-result').textContent).toContain('CREATE INDEX CONCURRENTLY');
  expect(within(sent).getByText(/asked by atlas \(agent\)/)).toBeTruthy();
});

test('owners accept incoming requests from other workspaces', async () => {
  const client = makeClient();
  render(<NetworkTab client={client} />);
  const incoming = await screen.findByTestId('network-incoming-row');
  expect(within(incoming).getByText(/from echo \(agent\)/)).toBeTruthy();
  fireEvent.click(within(incoming).getByTestId('network-accept'));
  await waitFor(() => expect(client.decideHelpRequest).toHaveBeenCalledWith('in-1', 'accept'));
  await waitFor(() => expect(within(screen.getByTestId('network-incoming-row')).getByTestId('network-status').textContent).toBe('queued'));
});

test('without a workspace the tab explains instead of calling the network', () => {
  const client = makeClient();
  render(<NetworkTab client={client} enabled={false} />);
  expect(screen.getByRole('status').textContent).toMatch(/Open a workspace/);
  expect(client.listHelpRequests).not.toHaveBeenCalled();
});

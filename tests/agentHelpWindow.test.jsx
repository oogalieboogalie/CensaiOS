/**
 * @jest-environment jsdom
 */
// eslint-disable-next-line no-unused-vars
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { jest } from '@jest/globals';
import { useWorkspaceStore } from '../src/lib/store.js';
// eslint-disable-next-line no-unused-vars
import { AgentHelpWindow } from '../src/components/windows/agentHelp/index.jsx';
// eslint-disable-next-line no-unused-vars
import { BoardAgentsPanel } from '../src/components/registry/BoardAgentsPanel.jsx';

const asker = { id: 'c1', kind: 'chat', agentId: 'atlas', x: 0, y: 0, w: 400, h: 300, msgs: [] };
const helper = { id: 'c2', kind: 'chat', agentId: 'nexus', x: 1000, y: 0, w: 400, h: 300, msgs: [] };

// eslint-disable-next-line no-unused-vars
function CardHost({ id }) {
  const win = useWorkspaceStore((state) => state.wins.find((w) => w.id === id));
  const onUpdate = (patch) => useWorkspaceStore.getState().onUpdate(id, patch);
  return win ? <AgentHelpWindow win={win} onUpdate={onUpdate} /> : null;
}

beforeEach(() => {
  useWorkspaceStore.setState({ workspaceId: 'ws1', wins: [asker, helper], links: [] });
  global.fetch = jest.fn();
});

test('a card follows the server request and hands the answer back to the asking chat once', async () => {
  useWorkspaceStore.setState((state) => ({ wins: [...state.wins, {
    id: 'h1', kind: 'agentHelp', executor: 'network', helpRequestId: 'r1', fromWindowId: 'c1', toWindowId: 'c2',
    fromLabel: 'Atlas', toLabel: 'Nexus', task: 'Write the orders migration', status: 'working', x: 500, y: 400, w: 340, h: 280,
  }] }));
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'r1', status: 'completed', result: 'ALTER TABLE orders ADD status text;' }) });
  render(<CardHost id="h1" />);
  await waitFor(() => expect(screen.getByTestId('agent-help-status').textContent).toBe('Answered'));
  expect(global.fetch.mock.calls[0][0]).toBe('/api/agent-registry/help-requests/r1?workspaceId=ws1');
  expect(screen.getByTestId('agent-help-result').textContent).toContain('ALTER TABLE orders');
  await waitFor(() => expect(useWorkspaceStore.getState().wins.find((w) => w.id === 'h1').deliveredAt).toBeTruthy(), { timeout: 3000 });
  const msgs = useWorkspaceStore.getState().wins.find((w) => w.id === 'c1').msgs;
  expect(msgs).toHaveLength(1);
  expect(msgs[0]).toMatchObject({ from: 'atlas', helpCardId: 'h1' });
  expect(msgs[0].text).toContain('Help from Nexus');
  expect(screen.getByText(/Sent back to Atlas/)).toBeInTheDocument();
  // The helper's own chat shows the exchange as its own message pair.
  const helperMsgs = useWorkspaceStore.getState().wins.find((w) => w.id === 'c2').msgs;
  expect(helperMsgs).toEqual([
    { from: 'atlas', text: 'Write the orders migration', helpCardId: 'h1', helpRequest: { fromLabel: 'Atlas' } },
    { from: 'nexus', text: 'ALTER TABLE orders ADD status text;', helpCardId: 'h1', helpReply: { toLabel: 'Atlas' } },
  ]);
  expect(useWorkspaceStore.getState().wins.find((w) => w.id === 'h1').helperLoggedAt).toBeTruthy();
});

test('a failed request still shows up in the helper chat, and an agent that already got its answer is not sent it again', async () => {
  useWorkspaceStore.setState((state) => ({ wins: [...state.wins,
    { id: 'h3', kind: 'agentHelp', executor: 'network', fromWindowId: 'c1', toWindowId: 'c2', fromLabel: 'Atlas', toLabel: 'Nexus',
      task: 'Plan it', status: 'failed', error: 'No model key.', x: 0, y: 0, w: 340, h: 280 },
    { id: 'h4', kind: 'agentHelp', executor: 'network', fromWindowId: 'c1', toWindowId: 'c2', fromLabel: 'Atlas', toLabel: 'Nexus',
      task: 'Index it', status: 'completed', result: 'Done.', deliveredAt: '2026-10-08T00:00:00Z', x: 0, y: 0, w: 340, h: 280 },
  ] }));
  render(<><CardHost id="h3" /><CardHost id="h4" /></>);
  await waitFor(() => expect(useWorkspaceStore.getState().wins.find((w) => w.id === 'h4').helperLoggedAt).toBeTruthy(), { timeout: 3000 });
  await waitFor(() => expect(useWorkspaceStore.getState().wins.find((w) => w.id === 'h3').helperLoggedAt).toBeTruthy(), { timeout: 3000 });
  const state = useWorkspaceStore.getState();
  expect(state.wins.find((w) => w.id === 'c1').msgs).toEqual([]);
  const texts = state.wins.find((w) => w.id === 'c2').msgs.map((m) => [m.from, m.text]);
  expect(texts).toEqual(expect.arrayContaining([
    ['atlas', 'Plan it'], ['nexus', 'I could not finish this: No model key.'], ['atlas', 'Index it'], ['nexus', 'Done.'],
  ]));
  expect(texts).toHaveLength(4);
});

test('a card whose agent is still waiting inside its tool call is not posted into the chat again', async () => {
  useWorkspaceStore.setState((state) => ({ wins: [...state.wins, {
    id: 'h2', kind: 'agentHelp', executor: 'network', helpRequestId: 'r2', fromWindowId: 'c1', toWindowId: 'c2', awaitingTool: true,
    fromLabel: 'Atlas', toLabel: 'Nexus', task: 't', status: 'completed', result: 'done', x: 0, y: 0, w: 340, h: 280,
  }] }));
  render(<CardHost id="h2" />);
  await new Promise((resolve) => { setTimeout(resolve, 1300); });
  const state = useWorkspaceStore.getState();
  expect(state.wins.find((w) => w.id === 'h2').deliveredAt).toBeUndefined();
  expect(state.wins.find((w) => w.id === 'c1').msgs).toEqual([]);
});

test('the board directory asks one agent on behalf of another and drops a linked card on the canvas', async () => {
  const client = { requestHelp: jest.fn(async (input) => ({ id: 'r9', cardId: input.cardId, cardName: 'Nexus', task: input.task, status: 'queued' })) };
  render(<BoardAgentsPanel client={client} />);
  const rows = screen.getAllByTestId('board-agent');
  expect(rows.map((row) => row.getAttribute('data-window-id'))).toEqual(['c1', 'c2']);
  const nexusRow = rows[1];
  fireEvent.click(within(nexusRow).getByTestId('board-ask'));
  fireEvent.change(screen.getByTestId('board-ask-task'), { target: { value: 'Index the orders table' } });
  fireEvent.change(screen.getByTestId('board-ask-from'), { target: { value: 'c1' } });
  fireEvent.click(screen.getByTestId('board-ask-send'));
  await waitFor(() => expect(client.requestHelp).toHaveBeenCalledWith({ cardId: 'agent:nexus', task: 'Index the orders table', onBehalfOf: 'atlas' }));
  await waitFor(() => expect(useWorkspaceStore.getState().wins.some((w) => w.kind === 'agentHelp')).toBe(true));
  const { wins, links } = useWorkspaceStore.getState();
  const card = wins.find((w) => w.kind === 'agentHelp');
  expect(card).toMatchObject({ helpRequestId: 'r9', fromWindowId: 'c1', toWindowId: 'c2', toLabel: 'Nexus', status: 'queued' });
  expect(links.map((l) => [l.fromId, l.toId])).toEqual([['c1', card.id], [card.id, 'c2']]);
  await waitFor(() => expect(screen.getAllByTestId('board-request')).toHaveLength(1));
  expect(screen.getAllByTestId('board-agent')[1].getAttribute('data-status')).toBe('working');
});

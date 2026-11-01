/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AgentListWindow } from '../src/components/windows/agentList/index.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';
import { runStarted } from '../src/lib/weewoo/agentRun.js';
import { CATEGORIES } from '../src/lib/modules/addPaletteItems.js';

const chat = (id, agentId, extra = {}) => ({ id, kind: 'chat', agentId, x: 600, y: 100, w: 400, h: 300, ...extra });
const SERVER = {
  chats: [],
  tasks: [],
  network: [{ cardId: 'ext:censai:abc', name: 'Ines\'s Nexus', source: 'censai', lastRequest: null }],
};

beforeEach(() => {
  const run = runStarted(null, { prompt: 'plan the release', by: 'Sam' });
  useWorkspaceStore.setState({
    workspaceId: null,
    wins: [chat('w-atlas', 'atlas', { agentRun: run, msgs: [{ from: 'me', text: 'hi Atlas' }, { from: 'atlas', text: 'Hello Sam' }] })],
  });
});
afterEach(cleanup);

test('the list groups agents by presence and shows what each is doing', async () => {
  await act(async () => { render(<AgentListWindow win={{ id: 'al1', kind: 'agentList' }} initialServer={SERVER} />); });
  const busy = screen.getByTestId('agent-list-group-busy');
  expect(busy.textContent).toContain('Working now');
  const atlas = screen.getAllByTestId('agent-list-row').find((r) => r.dataset.key === 'agent:atlas');
  expect(atlas.dataset.status).toBe('busy');
  expect(atlas.textContent).toContain('Chatting with Sam');
  expect(screen.getByTestId('agent-list-group-remote').textContent).toContain('On other computers');
  expect(screen.getByTestId('agent-list-group-offline')).toBeTruthy();
  expect(screen.getByRole('img', { name: 'Runs on another censaiOS computer' })).toBeTruthy();
});

test('search narrows the list; groups fold', async () => {
  await act(async () => { render(<AgentListWindow win={{ id: 'al1' }} initialServer={SERVER} />); });
  fireEvent.change(screen.getByTestId('agent-list-search'), { target: { value: 'another censaiOS' } });
  expect(screen.getAllByTestId('agent-list-row').map((r) => r.dataset.key)).toEqual(['card:ext:censai:abc']);
  fireEvent.change(screen.getByTestId('agent-list-search'), { target: { value: '' } });
  fireEvent.click(screen.getByTestId('agent-list-group-offline'));
  expect(screen.getAllByTestId('agent-list-row').some((r) => r.dataset.status === 'offline')).toBe(false);
});

test('clicking an agent opens a small chat card; sending goes through its real chat window', async () => {
  const onUpdate = jest.fn();
  useWorkspaceStore.setState({ onUpdate });
  await act(async () => { render(<AgentListWindow win={{ id: 'al1' }} initialServer={SERVER} />); });
  fireEvent.click(screen.getAllByTestId('agent-list-row').find((r) => r.dataset.key === 'agent:atlas'));
  const dm = screen.getByTestId('agent-list-dm');
  expect(within(dm).getByText('Hello Sam')).toBeTruthy();
  fireEvent.change(within(dm).getByTestId('agent-list-dm-input'), { target: { value: 'Ship it?' } });
  fireEvent.submit(within(dm).getByTestId('agent-list-dm-input').closest('form'));
  expect(onUpdate).toHaveBeenCalledWith('w-atlas', expect.objectContaining({
    autoSend: true, autoSendBy: expect.any(String), msgs: [expect.anything(), expect.anything(), expect.objectContaining({ from: 'me', text: 'Ship it?' })],
  }));
});

test('an agent with no window gets a chat window opened beside the list', async () => {
  const spawnAt = jest.fn(() => 'new-chat');
  const onUpdate = jest.fn();
  useWorkspaceStore.setState({ spawnAt, onUpdate });
  await act(async () => { render(<AgentListWindow win={{ id: 'al1', x: 1000, y: 50 }} initialServer={SERVER} />); });
  fireEvent.click(screen.getAllByTestId('agent-list-row').find((r) => r.dataset.key === 'agent:echo'));
  const dm = screen.getByTestId('agent-list-dm');
  fireEvent.change(within(dm).getByTestId('agent-list-dm-input'), { target: { value: 'Hi Echo' } });
  fireEvent.submit(within(dm).getByTestId('agent-list-dm-input').closest('form'));
  expect(spawnAt).toHaveBeenCalledWith('chat', { agentId: 'echo', title: 'Echo' }, { x: 556, y: 50 }, { w: 420, h: 560 });
  expect(onUpdate).toHaveBeenCalledWith('new-chat', expect.objectContaining({ autoSend: true }));
});

test('the Recent and Add tabs, and the window is in the Add menu', async () => {
  await act(async () => { render(<AgentListWindow win={{ id: 'al1' }} initialServer={SERVER} />); });
  fireEvent.click(screen.getByTestId('agent-list-tab-recent'));
  expect(screen.getByTestId('agent-list-recent').textContent).toContain('Atlas');
  fireEvent.click(screen.getByTestId('agent-list-tab-add'));
  expect(screen.getByTestId('agent-list-add').textContent).toContain('Echo');
  expect(CATEGORIES.find((c) => c.label === 'Chat and agents').kinds).toContain('agentList');
});

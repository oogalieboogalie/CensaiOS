/**
 * @jest-environment jsdom
 */
// A reply wake shows in the sender's chat by itself. The person does not
// type "check your messages".
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/lib/chat.js', () => ({ sendMessageWithMeta: jest.fn() }));
jest.unstable_mockModule('../src/lib/api/agentActivity.js', () => ({
  getMailActivity: jest.fn(async () => []),
  getAgentActivity: jest.fn(),
}));
jest.unstable_mockModule('../src/lib/api/censaiPlans.js', () => ({
  getOpenPlans: jest.fn(async () => []),
  markPlanTold: jest.fn(),
  stopPlanRun: jest.fn(),
}));

const { CensaiPinnedChat } = await import('../src/components/censai/CensaiPinnedChat.jsx');
const { sendMessageWithMeta } = await import('../src/lib/chat.js');
const { getAgentActivity } = await import('../src/lib/api/agentActivity.js');
const { useWorkspaceStore } = await import('../src/lib/store.js');

const THREADS_KEY = 'homebase.messenger.v1';

beforeEach(() => {
  window.localStorage.removeItem(THREADS_KEY);
  window.localStorage.removeItem('homebase.censai.pinned.v1');
  useWorkspaceStore.setState({ workspaceId: 'ws-1' });
  sendMessageWithMeta.mockReset();
  getAgentActivity.mockReset();
  getAgentActivity.mockResolvedValue({
    unread: 1,
    wakeups: [{
      id: 'wake-9',
      agent_id: 'censai',
      status: 'completed',
      message_type: 'agent_report',
      thread_id: 'thread-1',
      sender_name: 'Atlas',
      content: 'Two blocking issues in the plan.',
      response: 'I will fold both blockers into the plan.',
      updated_at: new Date().toISOString(),
    }],
  });
});

afterEach(() => {
  useWorkspaceStore.setState({ workspaceId: null });
});

test('Censai\'s chat shows Atlas\'s reply when the wake finishes, with no typed prompt', async () => {
  render(<CensaiPinnedChat workspaceId="ws-1" />);
  fireEvent.click(screen.getByLabelText('Open chat with Censai'));

  expect(await screen.findByText(/Two blocking issues in the plan/)).toBeInTheDocument();
  expect(screen.getByText(/fold both blockers into the plan/)).toBeInTheDocument();
  expect(screen.queryByText(/check your messages/i)).not.toBeInTheDocument();
  expect(screen.getByLabelText('Message Censai')).toHaveValue('');
  expect(sendMessageWithMeta).not.toHaveBeenCalled();
  expect(getAgentActivity).toHaveBeenCalledWith('censai', { workspaceId: 'ws-1' });
});

test('a reply for another agent is stored while Censai\'s thread is the one on screen', async () => {
  getAgentActivity.mockImplementation(async (agentId) => {
    if (agentId !== 'atlas') return { unread: 0, wakeups: [] };
    return {
      unread: 1,
      wakeups: [{
        id: 'wake-atlas',
        agent_id: 'atlas',
        status: 'completed',
        message_type: 'agent_report',
        thread_id: 'thread-2',
        sender_name: 'Nexus',
        content: 'The index is ready.',
        response: 'I will use the new index.',
        updated_at: new Date().toISOString(),
      }],
    };
  });

  render(<CensaiPinnedChat workspaceId="ws-1" />);
  fireEvent.click(screen.getByLabelText('Open chat with Censai'));

  await waitFor(() => {
    const saved = JSON.parse(window.localStorage.getItem(THREADS_KEY) || '{}');
    expect(saved.atlas?.some((message) => String(message.text).includes('The index is ready'))).toBe(true);
  });
  expect(screen.queryByText(/The index is ready/)).not.toBeInTheDocument();
  expect(getAgentActivity).toHaveBeenCalledWith('atlas', { workspaceId: 'ws-1' });

  fireEvent.click(screen.getByLabelText('Chat with Atlas'));
  expect(screen.getByText(/The index is ready/)).toBeInTheDocument();
  expect(screen.getByText(/use the new index/)).toBeInTheDocument();
});

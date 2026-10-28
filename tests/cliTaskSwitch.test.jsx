/** @jest-environment jsdom */
// Switching tasks in the Agent Console while the old task's poll is still in
// flight must not paint the old task's transcript into the new one.
import { jest } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';

const pending = {};
jest.unstable_mockModule('../src/components/agentConsole/cliAgentsApi.js', () => ({
  cliAgentsApi: {
    task: (id) => new Promise((resolve) => { pending[id] = resolve; }),
    changes: (id) => Promise.resolve({ files: [{ path: `${id}.txt` }], patch: '' }),
  },
}));
jest.unstable_mockModule('../src/components/agentConsole/useCliRoster.js', () => ({ refreshCliRoster: () => {} }));
const { useCliTask } = await import('../src/components/agentConsole/useCliTask.js');

const reply = (id, rev) => ({
  rev, task: { id, status: 'done', title: `Task ${id}` }, permissions: [],
  items: [{ id: `${id}-1`, kind: 'text', rev, at: 1, text: `from ${id}` }],
});

test('a late reply for the previous task is dropped', async () => {
  const { result, rerender } = renderHook(({ id }) => useCliTask(id), { initialProps: { id: 'a' } });
  await waitFor(() => expect(pending.a).toBeTruthy());
  rerender({ id: 'b' });
  await waitFor(() => expect(pending.b).toBeTruthy());
  await act(async () => { pending.a(reply('a', 40)); });
  await act(async () => { pending.b(reply('b', 3)); });
  expect(result.current.task?.id).toBe('b');
  expect(result.current.items.map((i) => i.id)).toEqual(['b-1']);
});

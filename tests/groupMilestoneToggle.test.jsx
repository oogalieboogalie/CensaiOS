/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { useGroupData } from '../src/components/group/useGroupData.js';

// Ticking a milestone used to show it as done even when the server said no
// (not signed in, database down, someone else's milestone), so it came back
// unticked on the next load. Now the tick only sticks when it was saved.

const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });

function mockServer({ completeStatus }) {
  global.fetch = async (url, init = {}) => {
    const path = String(url);
    if (path.startsWith('/api/milestones/Core%20Team')) return reply(200, [{ id: 4, title: 'Ship the demo', completed: false }]);
    if (path === '/api/milestones/4/complete' && init.method === 'PATCH') return reply(completeStatus, completeStatus < 400 ? { ok: true } : { error: 'No such milestone.' });
    return reply(200, []);
  };
}

test('a milestone the server refused to complete stays unticked and says why', async () => {
  mockServer({ completeStatus: 404 });
  const { result } = renderHook(() => useGroupData('Core Team', {}));
  await waitFor(() => expect(result.current.milestones).toHaveLength(1));
  await act(async () => { await result.current.toggleMilestone(4); });
  expect(result.current.milestones[0].completed).toBe(false);
  expect(result.current.error).toBe('No such milestone.');
});

test('a saved milestone is ticked', async () => {
  mockServer({ completeStatus: 200 });
  const { result } = renderHook(() => useGroupData('Core Team', {}));
  await waitFor(() => expect(result.current.milestones).toHaveLength(1));
  await act(async () => { await result.current.toggleMilestone(4); });
  expect(result.current.milestones[0].completed).toBe(true);
  expect(result.current.error).toBe(null);
});

/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useImageStudio } from '../src/components/windows/imageStudio/useImageStudio.js';
import { useWorkspaceStore } from '../src/lib/store.js';

const originalWorkspaceId = useWorkspaceStore.getState().workspaceId;
const win = { id: 'image-window', state: {} };

function response(images) {
  return {
    ok: true,
    json: jest.fn().mockResolvedValue({ images }),
  };
}

beforeEach(() => {
  global.fetch = jest.fn();
  act(() => useWorkspaceStore.setState({ workspaceId: null }));
});

afterEach(() => {
  delete global.fetch;
});

afterAll(() => {
  act(() => useWorkspaceStore.setState({ workspaceId: originalWorkspaceId }));
});

test('gallery follows the active workspace and discards the previous response', async () => {
  let resolveFirst;
  global.fetch
    .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
    .mockResolvedValueOnce(response([{ id: 'workspace-b-image' }]));
  const { result } = renderHook(() => useImageStudio(win, jest.fn()));

  act(() => useWorkspaceStore.setState({ workspaceId: 'workspace/a' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    '/api/images/gallery?workspaceId=workspace%2Fa'
  ));
  act(() => useWorkspaceStore.setState({ workspaceId: 'workspace-b' }));
  await waitFor(() => expect(result.current.gallery).toEqual([{ id: 'workspace-b-image' }]));

  await act(async () => resolveFirst(response([{ id: 'workspace-a-image' }])));
  expect(result.current.gallery).toEqual([{ id: 'workspace-b-image' }]);
});

test('generation is visibly blocked without a workspace and sends no request', async () => {
  const { result } = renderHook(() => useImageStudio({
    ...win,
    state: { imageStudio: { prompt: 'draw a safe icon' } },
  }, jest.fn()));

  await act(async () => result.current.generate());

  expect(result.current.error).toBe('Open a workspace before generating an image.');
  expect(global.fetch).not.toHaveBeenCalled();
});

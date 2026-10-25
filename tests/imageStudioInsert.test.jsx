/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { pendingAppLog } from '../src/lib/appLog/browserLog.js';
import { useWorkspaceStore } from '../src/lib/store.js';
import { ImageStudioWindow } from '../src/components/windows/imageStudio/index.jsx';

const originalWorkspaceId = useWorkspaceStore.getState().workspaceId;
const CARD_A = {
  id: 'image-a',
  prompt: 'Red card',
  src: 'https://example.test/card-a.png',
  thumbnailSrc: 'https://example.test/card-a-thumb.png',
};
const CARD_B = {
  id: 'image-b',
  prompt: 'Blue card',
  src: 'https://example.test/card-b.png',
  thumbnailSrc: 'https://example.test/card-b-thumb.png',
};

function response(images) {
  return {
    ok: true,
    json: jest.fn().mockResolvedValue({ images }),
  };
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue(response([CARD_A, CARD_B]));
  act(() => useWorkspaceStore.setState({ workspaceId: 'workspace-proof' }));
});

afterEach(() => {
  delete global.fetch;
});

afterAll(() => {
  act(() => useWorkspaceStore.setState({ workspaceId: originalWorkspaceId }));
});

test('pressing Insert on card B puts card B on the canvas when card A is selected', async () => {
  const { container } = render(<ImageStudioWindow win={{ id: 'image-window', state: {} }} onUpdate={jest.fn()} />);

  await waitFor(() => expect(screen.getByText('Red card')).toBeInTheDocument());
  const cardA = screen.getByText('Red card').closest('article');
  const cardB = screen.getByText('Blue card').closest('article');
  const loggedBefore = pendingAppLog().length;

  fireEvent.click(cardA);
  expect(cardA.style.border).toBe('1px solid var(--accent-line)');

  fireEvent.click(within(cardB).getByRole('button', { name: 'Insert' }));

  const placed = container.querySelector('image');
  expect(placed?.getAttribute('href') || placed?.getAttribute('xlink:href')).toBe(CARD_B.src);
  expect(container.querySelectorAll('image')).toHaveLength(1);
  expect(cardB.style.border).toBe('1px solid var(--accent-line)');
  expect(pendingAppLog().slice(loggedBefore).map(entry => entry.message)).toEqual([
    'image studio: inserted image-b',
  ]);
});

/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { FileCreateRow } from '../src/components/files/FileCreateRow.jsx';
import { SAVE_PROBLEMS } from '../shared/files/fileProblems.js';

// Files' New file makes a new file only: a name already in the folder is
// refused in plain words, never emptied. All files are made up.
function madeUpServer(status, body) {
  global.fetch = jest.fn(async () => ({ ok: status === 200, status, json: async () => body }));
}

function newFile(name) {
  const onOpenFile = jest.fn();
  const onDone = jest.fn();
  render(<FileCreateRow mode="file" dirPath="/made/up/project/notes" onOpenFile={onOpenFile} onDone={onDone} />);
  const box = screen.getByPlaceholderText('New file name…');
  fireEvent.change(box, { target: { value: name } });
  fireEvent.keyDown(box, { key: 'Enter' });
  return { onOpenFile, onDone };
}

test('a name already in the folder says so in plain words, and nothing opens', async () => {
  madeUpServer(409, { error: SAVE_PROBLEMS.exists, reason: 'exists' });
  const { onOpenFile, onDone } = newFile('made-up-plan.md');
  expect(await screen.findByText(SAVE_PROBLEMS.exists)).toBeInTheDocument();
  expect(onOpenFile).not.toHaveBeenCalled();
  expect(onDone).not.toHaveBeenCalled();
  expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ path: '/made/up/project/notes/made-up-plan.md', content: '', create: true });
});

test('a new name makes the file and opens it', async () => {
  madeUpServer(200, { ok: true });
  const { onOpenFile, onDone } = newFile('made-up-new.md');
  await waitFor(() => expect(onOpenFile).toHaveBeenCalledWith('made-up-new.md', '/made/up/project/notes/made-up-new.md'));
  expect(onDone).toHaveBeenCalledWith(true);
});

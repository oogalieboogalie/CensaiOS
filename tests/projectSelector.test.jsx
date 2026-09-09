/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { ProjectSelector } from '../src/components/chrome/ProjectSelector.jsx';

const PROJECTS = [
  { id: 'p-alpha', name: 'Alpha', path: 'C:\\work\\alpha' },
  { id: 'p-beta', name: 'Beta', path: 'C:\\work\\beta' },
];

const realConfirm = window.confirm;

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({ projects: PROJECTS }),
  });
  window.confirm = jest.fn(() => true);
});

afterEach(() => {
  window.confirm = realConfirm;
  jest.restoreAllMocks();
});

function renderSelector(props = {}) {
  return render(
    <ProjectSelector
      currentProject={{ projectId: 'p-alpha', name: 'Alpha', path: 'C:\\work\\alpha' }}
      onOpenLocalProject={jest.fn()}
      onClose={jest.fn()}
      {...props}
    />
  );
}

test('dropdown switch confirms, opens, and closes on success', async () => {
  const onOpenLocalProject = jest.fn().mockResolvedValue({});
  const onClose = jest.fn();
  renderSelector({ onOpenLocalProject, onClose });

  await waitFor(() => expect(screen.getByText(/Beta/)).toBeTruthy());
  await act(async () => {
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p-beta' } });
  });

  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Beta'));
  await waitFor(() => expect(onOpenLocalProject).toHaveBeenCalledWith({
    path: 'C:\\work\\beta', name: 'Beta',
  }));
  expect(onClose).toHaveBeenCalled();
});

test('cancelled confirm never touches the project', async () => {
  window.confirm = jest.fn(() => false);
  const onOpenLocalProject = jest.fn();
  const onClose = jest.fn();
  renderSelector({ onOpenLocalProject, onClose });

  await waitFor(() => expect(screen.getByText(/Beta/)).toBeTruthy());
  await act(async () => {
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p-beta' } });
  });

  expect(onOpenLocalProject).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

test('failed switch surfaces the error instead of failing silently', async () => {
  const onOpenLocalProject = jest.fn().mockRejectedValue(new Error('Path does not exist'));
  renderSelector({ onOpenLocalProject, onClose: jest.fn() });

  await waitFor(() => expect(screen.getByText(/Beta/)).toBeTruthy());
  await act(async () => {
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p-beta' } });
  });

  await waitFor(() => expect(screen.getByText('Path does not exist')).toBeTruthy());
});

test('github-only rows and same-folder duplicates collapse out of the list', async () => {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: jest.fn().mockResolvedValue({ projects: [
      { id: 'g-1', name: 'Idea-Foundry', path: null, repo: 'someone/Idea-Foundry' },
      { id: 'd-1', name: 'Same', path: 'C:\\work\\same' },
      { id: 'd-2', name: 'Same', path: 'C:\\work\\same\\' },
      { id: 'd-3', name: 'Other', path: 'C:\\work\\other' },
    ] }),
  });
  render(
    <ProjectSelector
      currentProject={null}
      onOpenLocalProject={jest.fn()}
      onClose={jest.fn()}
    />
  );

  await waitFor(() => expect(screen.getByText(/Other/)).toBeTruthy());
  const options = screen.getAllByRole('option').map(o => o.textContent);
  expect(options.some(t => t.includes('Idea-Foundry'))).toBe(false);
  expect(options.filter(t => t.includes('Same'))).toHaveLength(1);
});

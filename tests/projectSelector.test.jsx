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

test('dropdown switch sets the default without a confirm, and closes on success', async () => {
  const onOpenLocalProject = jest.fn().mockResolvedValue({});
  const onClose = jest.fn();
  renderSelector({ onOpenLocalProject, onClose });

  await waitFor(() => expect(screen.getByText(/Beta/)).toBeTruthy());
  await act(async () => {
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p-beta' } });
  });

  // Multi-project board: open windows keep their project, nothing to confirm.
  expect(window.confirm).not.toHaveBeenCalled();
  await waitFor(() => expect(onOpenLocalProject).toHaveBeenCalledWith({
    path: 'C:\\work\\beta', name: 'Beta',
  }));
  expect(onClose).toHaveBeenCalled();
});

test('explains that open windows keep their own project', async () => {
  renderSelector();
  await waitFor(() => expect(screen.getByText(/Default for new windows/)).toBeTruthy());
  expect(screen.getByText(/keep their own project/)).toBeTruthy();
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

test('the default project comes first, helper copies and temp folders stay out, names are short', async () => {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: jest.fn().mockResolvedValue({ projects: [
      { id: 'w-1', name: 'fix-x', path: '/home/alma/Shop-worktrees/fix-x', updatedAt: '2026-11-15T00:00:00Z' },
      { id: 'w-2', name: 'ag-1', path: '/home/alma/.cache/agent-worktrees/ag-1', updatedAt: '2026-11-15T00:00:00Z' },
      { id: 't-1', name: 'try', path: '/tmp/try', updatedAt: '2026-11-15T00:00:00Z' },
      { id: 'b-1', name: 'Blog', path: 'D:\\Repos\\Blog', updatedAt: '2026-11-14T00:00:00Z' },
      { id: 's-new', name: 'shop-site', path: 'D:\\Repos\\Shop', updatedAt: '2026-11-13T00:00:00Z' },
      { id: 's-old', name: 'Shop', path: 'd:/repos/shop/', updatedAt: '2026-11-01T00:00:00Z' },
    ] }),
  });
  renderSelector({ currentProject: { projectId: 's-old', name: 'Shop', path: 'D:\\Repos\\Shop' } });

  await waitFor(() => expect(screen.getByText('Blog')).toBeTruthy());
  const options = screen.getAllByRole('option').filter(o => o.value).map(o => o.textContent);
  expect(options).toEqual(['Shop', 'Blog']);
  expect(screen.getByRole('combobox').value).toBe('s-old');
  expect(document.body.textContent.includes('\u2014')).toBe(false);
});

test('the default stays picked when its row for the folder has another id', async () => {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: jest.fn().mockResolvedValue({ projects: [
      { id: 's-new', name: 'Shop', path: 'D:\\Repos\\Shop' },
      { id: 'b-1', name: 'Blog', path: 'D:\\Repos\\Blog' },
    ] }),
  });
  renderSelector({ currentProject: { projectId: 'gone-id', name: 'Shop', path: 'D:/Repos/Shop/' } });
  await waitFor(() => expect(screen.getByText('Blog')).toBeTruthy());
  expect(screen.getByRole('combobox').value).toBe('s-new');
});

test('a failed load says so instead of showing an empty list', async () => {
  global.fetch.mockResolvedValueOnce({ ok: false, json: jest.fn().mockResolvedValue({ error: 'boom' }) });
  renderSelector();
  await waitFor(() => expect(screen.getByText(/could not be loaded/)).toBeTruthy());
  expect(screen.queryByText(/No folders yet/)).toBeNull();
});

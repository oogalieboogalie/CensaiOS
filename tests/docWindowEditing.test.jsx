/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { DocWindow } from '../src/components/DocWindow.jsx';

test('View exits document editing without the textarea blur reopening it', async () => {
  const onUpdate = jest.fn();
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => [],
  }));
  render(<DocWindow
    win={{
      id: 'proof-doc', kind: 'doc', fileName: 'Proof.md',
      text: '# Multiplayer proof', isEditing: true, annotations: [],
    }}
    onUpdate={onUpdate}
    onSpawn={jest.fn()}
    onSelect={jest.fn()}
    wins={[]}
    onAssign={jest.fn()}
    workspaceId="workspace-1"
  />);
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());

  const view = screen.getByRole('button', { name: 'View' });
  expect(fireEvent.mouseDown(view)).toBe(false);
  fireEvent.click(view);

  expect(screen.getByRole('button', { name: 'Edit' })).toBeVisible();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(onUpdate).toHaveBeenLastCalledWith({ isEditing: false });
});

test('remote typing locks the editor read-only with an explanation', async () => {
  const onUpdate = jest.fn();
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => [],
  }));
  render(<DocWindow
    win={{
      id: 'proof-doc', kind: 'doc', fileName: 'Proof.md',
      text: '# Multiplayer proof', isEditing: true, annotations: [],
      typingActor: { label: 'Member 8 typing…' },
    }}
    onUpdate={onUpdate}
    onSpawn={jest.fn()}
    onSelect={jest.fn()}
    wins={[]}
    onAssign={jest.fn()}
    workspaceId="workspace-1"
  />);
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());

  const box = screen.getByRole('textbox');
  expect(box).toHaveAttribute('readOnly');
  expect(screen.getByText(/read-only while they type/i)).toBeVisible();
});

test('Source filter shows raw code instead of rendered markdown', async () => {
  const onUpdate = jest.fn();
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => [],
  }));
  const winProps = {
    id: 'code-doc', kind: 'doc', fileName: 'app.js',
    text: '# not a heading\nconst a = 1;', annotations: [],
  };
  const { container, rerender } = render(<DocWindow
    win={winProps}
    onUpdate={onUpdate}
    onSpawn={jest.fn()}
    onSelect={jest.fn()}
    wins={[]}
    onAssign={jest.fn()}
    workspaceId="workspace-1"
  />);
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());

  // Rendered by default: the `#` line is consumed as a heading.
  expect(container.querySelector('pre')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Source' }));
  expect(onUpdate).toHaveBeenCalledWith({ sourceView: true });

  rerender(<DocWindow
    win={{ ...winProps, sourceView: true }}
    onUpdate={onUpdate}
    onSpawn={jest.fn()}
    onSelect={jest.fn()}
    wins={[]}
    onAssign={jest.fn()}
    workspaceId="workspace-1"
  />);
  const pre = container.querySelector('pre');
  expect(pre.textContent).toContain('# not a heading');
  expect(pre.textContent).toContain('const a = 1;');
  expect(screen.getByRole('button', { name: 'Rendered' })).toBeInTheDocument();
});

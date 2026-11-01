/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { DocWindow } from '../src/components/DocWindow.jsx';
import { startsBlank } from '../src/components/doc/useDoc.js';
import { useWorkspaceStore } from '../src/lib/store.js';

afterEach(() => useWorkspaceStore.getState().setActiveId(null));

function open(win) {
  const onUpdate = jest.fn();
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => [] }));
  const view = render(<DocWindow win={{ kind: 'doc', annotations: [], ...win }} onUpdate={onUpdate}
    onSpawn={jest.fn()} onSelect={jest.fn()} wins={[]} onAssign={jest.fn()} workspaceId="workspace-1" />);
  return { ...view, onUpdate };
}

test('a brand-new Document opens ready to type for the person who made it', async () => {
  useWorkspaceStore.getState().setActiveId('new-doc');
  open({ id: 'new-doc' });
  expect(screen.getByRole('textbox', { name: 'Document text' })).toHaveAttribute('placeholder', 'Start typing…');
});

test("a teammate's brand-new Document opens in the reading view, not in my editor", () => {
  useWorkspaceStore.getState().setActiveId('something-else');
  open({ id: 'their-doc' });
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.getByText('Click anywhere to start writing')).toBeVisible();
});

test('only an empty Document with no file starts in the editor', () => {
  expect(startsBlank({ id: 'a' })).toBe(true);
  expect(startsBlank({ id: 'b', text: 'Made-up words' })).toBe(false);
  expect(startsBlank({ id: 'c', filePath: '/made/up.md' })).toBe(false);
  expect(startsBlank({ id: 'd', isGithub: true })).toBe(false);
});

test('one click on the words opens the editor with the caret where you clicked', async () => {
  const { container, onUpdate } = open({ id: 'click-doc', text: 'Made-up words to click' });
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  const words = screen.getByText('Made-up words to click');
  const textNode = words.firstChild;
  const sel = window.getSelection();
  sel.removeAllRanges();
  const range = document.createRange();
  range.setStart(textNode, 8);
  range.collapse(true);
  sel.addRange(range);
  fireEvent.mouseUp(words);
  const box = await screen.findByRole('textbox', { name: 'Document text' });
  expect(onUpdate).toHaveBeenCalledWith({ isEditing: true });
  expect(box.selectionStart).toBe(8);
  expect(container.querySelector('[data-doc-body]')).toBeInTheDocument();
});

test('dragging over words still offers a comment instead of editing', async () => {
  open({ id: 'drag-doc', text: 'Made-up words to comment on' });
  const textNode = screen.getByText('Made-up words to comment on').firstChild;
  const sel = window.getSelection();
  sel.removeAllRanges();
  const range = document.createRange();
  range.setStart(textNode, 0);
  range.setEnd(textNode, 7);
  sel.addRange(range);
  fireEvent.mouseUp(textNode.parentElement);
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

test('the comments panel stays hidden until you open it', async () => {
  const winProps = { id: 'comments-doc', text: 'Made-up words', annotations: [{ id: 'n1', kind: 'comment', start: 0, end: 4, quote: 'Made', body: 'Made-up comment' }] };
  const { onUpdate, rerender } = open(winProps);
  expect(screen.queryByText('Made-up comment')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Comments 1' }));
  expect(onUpdate).toHaveBeenCalledWith({ showComments: true });
  rerender(<DocWindow win={{ kind: 'doc', ...winProps, showComments: true }} onUpdate={onUpdate}
    onSpawn={jest.fn()} onSelect={jest.fn()} wins={[]} onAssign={jest.fn()} workspaceId="workspace-1" />);
  expect(screen.getByText('Made-up comment')).toBeVisible();
});

test('a click on commented words opens the comments with that comment picked, instead of editing', () => {
  const winProps = { id: 'painted-doc', text: 'Made-up words', annotations: [{ id: 'n1', kind: 'comment', start: 0, end: 7, quote: 'Made-up', body: 'Made-up comment' }] };
  const { onUpdate } = open(winProps);
  const textNode = screen.getByText('Made-up words').firstChild;
  const sel = window.getSelection();
  sel.removeAllRanges();
  const range = document.createRange();
  range.setStart(textNode, 3);
  range.collapse(true);
  sel.addRange(range);
  fireEvent.mouseUp(textNode.parentElement);
  expect(onUpdate).toHaveBeenCalledWith({ showComments: true });
  expect(onUpdate).not.toHaveBeenCalledWith({ isEditing: true });
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

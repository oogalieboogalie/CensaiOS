/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import '@testing-library/jest-dom';
import { HtmlPreviewWindow } from '../src/components/HtmlPreviewWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

const sourceWindow = (code) => ({
  id: 'frontend-code',
  kind: 'code_editor',
  fileName: 'index.html',
  code,
});

test('linked preview persists each live edit as its deletion fallback', async () => {
  const first = '<h1>First live edit</h1>';
  const latest = '';
  const onUpdate = jest.fn();
  let win = {
    sourceWindowId: 'frontend-code',
    fileName: 'index.html',
    html: '<h1>Original snapshot</h1>',
  };
  useWorkspaceStore.setState({ wins: [sourceWindow(first)] });
  const view = render(<HtmlPreviewWindow win={win} onUpdate={onUpdate} />);

  await waitFor(() => expect(onUpdate).toHaveBeenLastCalledWith({ html: first }));
  win = { ...win, html: first };
  view.rerender(<HtmlPreviewWindow win={win} onUpdate={onUpdate} />);

  act(() => useWorkspaceStore.setState({ wins: [sourceWindow(latest)] }));
  await waitFor(() => expect(onUpdate).toHaveBeenLastCalledWith({ html: latest }));
  win = { ...win, html: latest };
  view.rerender(<HtmlPreviewWindow win={win} onUpdate={onUpdate} />);

  act(() => useWorkspaceStore.setState({ wins: [] }));
  expect(await screen.findByText(/Showing the last saved snapshot/i)).toBeInTheDocument();
  expect(screen.getByTitle('index.html')).toHaveAttribute('srcdoc', latest);
});

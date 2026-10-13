/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { CodeEditorWindow } from '../src/components/CodeEditorWindow.jsx';
import { resolveLinkedPreviewSource } from '../src/components/preview/linkedPreviewSource.js';

test('code editor opens a preview linked to its durable window id', () => {
  const onSpawn = jest.fn();
  render(
    <CodeEditorWindow
      win={{ id: 'frontend-code', fileName: 'index.html', code: '<h1>Shared</h1>' }}
      onUpdate={jest.fn()}
      onSpawn={onSpawn}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: /preview/i }));
  expect(onSpawn).toHaveBeenCalledWith('htmlPreview', expect.objectContaining({
    title: 'Shared Preview',
    fileName: 'index.html',
    html: '<h1>Shared</h1>',
    sourceWindowId: 'frontend-code',
  }));
});

test('linked preview follows source code and keeps a snapshot fallback', () => {
  const win = {
    sourceWindowId: 'frontend-code',
    fileName: 'index.html',
    html: '<h1>Snapshot</h1>',
  };
  expect(resolveLinkedPreviewSource(win, {
    id: 'frontend-code',
    kind: 'code_editor',
    fileName: 'index.html',
    code: '<h1>Live</h1>',
  })).toMatchObject({
    linked: true,
    missing: false,
    html: '<h1>Live</h1>',
    label: 'index.html',
  });
  expect(resolveLinkedPreviewSource(win, null)).toMatchObject({
    linked: false,
    missing: true,
    html: '<h1>Snapshot</h1>',
  });
});

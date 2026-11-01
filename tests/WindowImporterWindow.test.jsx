/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WindowImporterWindow } from '../src/components/WindowImporterWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

let fetchCalls = [];

beforeEach(() => {
  fetchCalls = [];
  useWorkspaceStore.setState({ workspaceId: 'ws-test-importer' });
  global.fetch = jest.fn((url, opts = {}) => {
    fetchCalls.push({ url, method: opts.method || 'GET', body: opts.body });
    if (url.endsWith('/api/windows/import')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          label: 'Widget Window',
          kind: 'widget_window',
          componentName: 'WidgetWindow',
          syncOk: true,
        }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({}),
    });
  });
});

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

test('renders WindowImporterWindow and imports JSX snippet', async () => {
  await act(async () => {
    render(<WindowImporterWindow />);
  });

  // Verify main heading and subtitle text
  expect(screen.getByText('Window importer')).toBeTruthy();
  expect(screen.getByText('Turn AI Studio code into a censaiOS window')).toBeTruthy();

  // Find the JSX input textarea
  const jsxInput = document.getElementById('wi-jsx-input');
  expect(jsxInput).toBeTruthy();

  // Type JSX code
  const sampleJsx = 'export default function App() { return <div>My Custom Window</div>; }';
  fireEvent.change(jsxInput, { target: { value: sampleJsx } });

  // Click Adapt & Import button
  const importBtn = document.getElementById('wi-import-btn');
  expect(importBtn).toBeTruthy();
  expect(importBtn.disabled).toBe(false);

  await act(async () => {
    fireEvent.click(importBtn);
  });

  // Verify fetch call was made
  const importCall = fetchCalls.find((c) => c.url.endsWith('/api/windows/import') && c.method === 'POST');
  expect(importCall).toBeTruthy();
  expect(JSON.parse(importCall.body)).toEqual(
    expect.objectContaining({
      rawJsx: sampleJsx,
    })
  );

  // Verify done screen rendered with imported label
  expect(await screen.findByText('Widget Window imported!')).toBeTruthy();
});

// The Options tab used to offer "Add to canvas launcher tiles", but no tile
// ever appeared: the empty board offers only its three starting buttons
// (src/lib/launchpadStarts.js). It now says where a new window goes.
test('Options says where a new window goes, with no launcher box, and the import sends no launcher', async () => {
  await act(async () => {
    render(<WindowImporterWindow />);
  });
  fireEvent.click(screen.getByText('⚙ Options'));

  expect(document.getElementById('wi-hint-input')).toBeTruthy();
  expect(screen.getByText('The new window stays out of Add until someone checks it and publishes it in the code.')).toBeTruthy();
  expect(document.querySelector('input[type="checkbox"]')).toBeNull();
  expect(document.body.textContent).not.toMatch(/launcher/i);

  fireEvent.change(document.getElementById('wi-hint-input'), { target: { value: 'Made-up tip jar for the team' } });
  fireEvent.click(screen.getByText('⚛ JSX / TSX'));
  fireEvent.change(document.getElementById('wi-jsx-input'), {
    target: { value: 'export default function App() { return <div>Made-up tip jar</div>; }' },
  });
  await act(async () => {
    fireEvent.click(document.getElementById('wi-import-btn'));
  });

  const importCall = fetchCalls.find((c) => c.url.endsWith('/api/windows/import') && c.method === 'POST');
  expect(JSON.parse(importCall.body)).toEqual({
    rawJsx: 'export default function App() { return <div>Made-up tip jar</div>; }',
    rawCss: '',
    hint: 'Made-up tip jar for the team',
  });
});

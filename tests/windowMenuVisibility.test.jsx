/** @jest-environment jsdom */

// eslint-disable-next-line no-unused-vars
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
// eslint-disable-next-line no-unused-vars
import { WindowMenu } from '../src/components/topbar/WindowMenu.jsx';

beforeEach(() => {
  global.fetch = async () => ({ ok: true, json: async () => ({ modules: [], templates: [] }) });
});

async function openPalette() {
  render(<WindowMenu onSpawn={() => {}} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /add/i })); });
}

test('working modules remain while unfinished modules stay hidden', async () => {
  await openPalette();
  // Context Feed was descoped (commented out in integrationWindows.js) — not in the palette.
  expect(screen.queryByText('Context Feed')).not.toBeInTheDocument();
  for (const label of [
    'Governance', 'policy-dashboard', 'Hello Factory', 'Spreadsheet',
    'Linear', 'Kubernetes',
    'Registry Test Window', 'Automation Board',
    'Sovereign Test', 'Rook Agent Control',
  ]) {
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  }
  // Finished in the module audit, so they are discoverable now.
  for (const label of ['Shared Preview', 'Workflow', 'Analytics Board', 'Provenance Explorer']) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
  // Figma graduated: it imports designs onto the canvas as live code.
  expect(screen.getByText('Figma')).toBeInTheDocument();
  // Spec 6: the last row always offers to make a new module.
  expect(screen.getByText('Make a new module…')).toBeInTheDocument();
});

test('add palette always has a second-click, outside-click, and Escape exit', async () => {
  render(<WindowMenu onSpawn={() => {}} />);
  const trigger = screen.getByRole('button', { name: /add/i });

  await act(async () => { fireEvent.click(trigger); });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await act(async () => { fireEvent.click(trigger); });
  expect(screen.queryByRole('dialog')).toBeNull();

  await act(async () => { fireEvent.click(trigger); });
  fireEvent.mouseDown(screen.getByRole('dialog').parentElement);
  expect(screen.queryByRole('dialog')).toBeNull();

  await act(async () => { fireEvent.click(trigger); });
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();

  await act(async () => { fireEvent.keyDown(window, { key: 'k', ctrlKey: true }); });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('a search with no match offers to make that module', async () => {
  await openPalette();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'tip calculator for my crew' } });
  const options = screen.getAllByRole('option');
  expect(options).toHaveLength(1);
  expect(options[0]).toHaveTextContent('Make a new module: tip calculator for my crew');
});

/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { useWorkspaceStore } from '../src/lib/store.js';
import { WindowChromeContext } from '../src/components/windows/windowChromeContext.js';
import { DesignBlockWindow } from '../src/components/DesignBlockWindow.jsx';
import { FigmaWindow } from '../src/components/FigmaWindow.jsx';
import { designBlockFromImport } from '../src/components/figma/figmaApi.js';

// The Figma API is mocked at the app's own /api/design routes; no real token.
const FILE_URL = 'https://www.figma.com/design/AbC123xyz/Landing-Page';
const FIGMA = { fileKey: 'AbC123xyz', nodeId: '1:2', fileName: 'Landing Page', url: FILE_URL };
const initialWins = useWorkspaceStore.getState().wins;

function json(body, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: async () => body });
}

function routes(handlers) {
  global.fetch = jest.fn((url, init = {}) => {
    const key = `${init.method || 'GET'} ${String(url).split('?')[0]}`;
    if (!handlers[key]) throw new Error(`unexpected fetch ${key}`);
    return handlers[key](url, init);
  });
}

function importResult(nodeId, html, extra = {}) {
  return { fileKey: 'AbC123xyz', nodeId, name: nodeId === '1:2' ? 'Hero' : 'Logo sheet', fileName: 'Landing Page', width: 1440, height: 900, html, renderUrl: `https://render.figma.example/${nodeId}.png`, fidelity: 'high', lastModified: '2026-10-09T20:00:00Z', ...extra };
}

function Block({ id }) {
  const win = useWorkspaceStore(state => state.wins.find(w => w.id === id));
  const onUpdate = React.useCallback((patch) => useWorkspaceStore.getState().onUpdate(id, patch), [id]);
  return (
    <WindowChromeContext.Provider value={{ isActive: true }}>
      <DesignBlockWindow win={win} onUpdate={onUpdate} />
    </WindowChromeContext.Provider>
  );
}

function FigmaHarness({ id }) {
  const win = useWorkspaceStore(state => state.wins.find(w => w.id === id));
  const onUpdate = React.useCallback((patch) => useWorkspaceStore.getState().onUpdate(id, patch), [id]);
  return <FigmaWindow win={win} onUpdate={onUpdate} />;
}

const block = (props = {}) => ({ id: 'block-1', kind: 'designBlock', type: 'designBlock', title: 'Hero', x: 700, y: 0, w: 1440, h: 900, source: '<main>Old hero</main>', sourceType: 'html', bare: true, frameless: true, figma: FIGMA, ...props });

afterEach(() => { cleanup(); act(() => useWorkspaceStore.setState({ wins: initialWins })); delete global.fetch; });

describe('Sync from Figma on a placed block', () => {
  test('pulls the frame again, and Undo brings back the edits it replaced', async () => {
    routes({ 'POST /api/design/figma/import': (_url, init) => {
      expect(JSON.parse(init.body)).toEqual({ url: FILE_URL, nodeId: '1:2', refresh: true });
      return json(importResult('1:2', '<main>New hero from Figma</main>'));
    } });
    act(() => useWorkspaceStore.setState({ wins: [block({ source: '<main>Hero edited by a model</main>' })] }));
    const { container } = render(<Block id="block-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Sync from Figma' }));
    await waitFor(() => expect(container.querySelector('iframe').getAttribute('srcdoc')).toContain('New hero from Figma'));
    const synced = useWorkspaceStore.getState().wins[0];
    expect(synced).toMatchObject({ previousSource: '<main>Hero edited by a model</main>', renderUrl: 'https://render.figma.example/1:2.png' });
    expect(synced.figma).toMatchObject({ ...FIGMA, lastModified: '2026-10-09T20:00:00Z' });
    expect(synced.figma.syncedAt).toEqual(expect.any(String));

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(container.querySelector('iframe').getAttribute('srcdoc')).toContain('Hero edited by a model'));
  });

  test('a failed sync says why and leaves the block alone', async () => {
    routes({ 'POST /api/design/figma/import': () => json({ error: 'Figma rejected the token, or it cannot read this file.' }, 424) });
    act(() => useWorkspaceStore.setState({ wins: [block()] }));
    render(<Block id="block-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Sync from Figma' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Figma rejected the token');
    expect(useWorkspaceStore.getState().wins[0].source).toBe('<main>Old hero</main>');
  });

  test('pasted blocks have no Figma sync but can copy their code', async () => {
    const writeText = jest.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    act(() => useWorkspaceStore.setState({ wins: [block({ figma: undefined })] }));
    render(<Block id="block-1" />);
    expect(screen.queryByRole('button', { name: 'Sync from Figma' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(writeText).toHaveBeenCalledWith('<main>Old hero</main>');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });
});

describe('Placing frames', () => {
  test('low-fidelity frames start on Figma\'s render; Image places every frame as the render', () => {
    expect(designBlockFromImport(importResult('1:2', '<main/>'), FILE_URL).view).toBe('live');
    expect(designBlockFromImport(importResult('1:2', '<main/>', { fidelity: 'low' }), FILE_URL).view).toBe('render');
    expect(designBlockFromImport(importResult('1:2', '<main/>'), FILE_URL, { placeAs: 'image' }).view).toBe('render');
    expect(designBlockFromImport(importResult('1:2', '<main/>', { renderUrl: null }), FILE_URL, { placeAs: 'image' }).view).toBe('live');
  });

  test('pages filter the frames, Place as Image lands renders, and Sync all refreshes placed frames', async () => {
    let version = 1;
    routes({
      'GET /api/design/figma/status': () => json({ connected: true, source: 'byok', user: 'Alma Designer' }),
      'GET /api/design/figma/frames': () => json({
        fileKey: 'AbC123xyz',
        name: 'Landing Page',
        frames: [
          { id: '1:2', name: 'Hero', page: 'Web', width: 1440, height: 900 },
          { id: '5:1', name: 'Logo sheet', page: 'Brand', width: 800, height: 600 },
        ],
      }),
      'POST /api/design/figma/import': (_url, init) => {
        const { nodeId } = JSON.parse(init.body);
        return json(importResult(nodeId, `<main>${nodeId} v${version}</main>`));
      },
    });
    act(() => useWorkspaceStore.setState({ wins: [{ id: 'fig-1', kind: 'figma', type: 'figma', x: 0, y: 0, w: 640, h: 560 }] }));
    render(<FigmaHarness id="fig-1" />);

    fireEvent.change(await screen.findByLabelText('Figma file link'), { target: { value: FILE_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Show frames' }));
    expect(await screen.findByText('2 pages · 2 frames')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Brand' }));
    expect(screen.queryByRole('button', { name: /Hero/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Logo sheet/ }));

    fireEvent.click(screen.getByRole('radio', { name: 'Image' }));
    expect(useWorkspaceStore.getState().wins[0].figmaPlaceAs).toBe('image');
    fireEvent.click(screen.getByRole('button', { name: 'Place 1 on canvas' }));
    await waitFor(() => expect(useWorkspaceStore.getState().wins.filter(w => w.kind === 'designBlock')).toHaveLength(1));
    const placed = useWorkspaceStore.getState().wins.find(w => w.kind === 'designBlock');
    expect(placed).toMatchObject({ title: 'Logo sheet', view: 'render', bare: true, source: '<main>5:1 v1</main>', figma: { fileKey: 'AbC123xyz', nodeId: '5:1' } });

    version = 2;
    fireEvent.click(await screen.findByRole('button', { name: 'Sync 1 on the canvas from Figma' }));
    await waitFor(() => expect(useWorkspaceStore.getState().wins.find(w => w.kind === 'designBlock').source).toBe('<main>5:1 v2</main>'));
    expect(useWorkspaceStore.getState().wins.find(w => w.kind === 'designBlock').previousSource).toBe('<main>5:1 v1</main>');
  });
});

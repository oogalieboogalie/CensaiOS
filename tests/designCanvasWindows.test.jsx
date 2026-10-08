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
import { layoutImportedFrames } from '../src/components/figma/figmaApi.js';
import { WindowFrame } from '../src/components/Windows.jsx';

const FILE_URL = 'https://www.figma.com/design/AbC123xyz/Landing-Page';
const initialWins = useWorkspaceStore.getState().wins;

function json(body, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: async () => body });
}

function Block({ win, active = true }) {
  const live = useWorkspaceStore(state => state.wins.find(w => w.id === win.id)) || win;
  const onUpdate = React.useCallback((patch) => useWorkspaceStore.getState().onUpdate(win.id, patch), [win.id]);
  return (
    <WindowChromeContext.Provider value={{ isActive: active }}>
      <DesignBlockWindow win={live} onUpdate={onUpdate} />
    </WindowChromeContext.Provider>
  );
}

function seedBlock(props = {}) {
  const win = { id: 'block-1', kind: 'designBlock', type: 'designBlock', title: 'Hero', x: 100, y: 50, w: 800, h: 500, source: '<main data-name="Hero">Hello canvas</main>', sourceType: 'html', frameless: true, bare: true, ...props };
  act(() => useWorkspaceStore.setState({ wins: [win] }));
  return win;
}

beforeEach(() => { jest.useRealTimers(); });
afterEach(() => { cleanup(); act(() => useWorkspaceStore.setState({ wins: initialWins })); delete global.fetch; });

describe('Design block', () => {
  test('renders its code in a sandboxed iframe with no window title', () => {
    const win = seedBlock();
    const { container } = render(<Block win={win} />);
    const frame = container.querySelector('iframe');
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-modals');
    expect(frame.getAttribute('srcdoc')).toContain('Hello canvas');
    expect(container.querySelector('[data-window-title-rail]')).toBeNull();
    expect(screen.getByRole('toolbar', { name: 'Design block tools' })).toBeInTheDocument();
  });

  test('unselected, a shield takes the click and the toolbar hides', () => {
    const win = seedBlock();
    const { container } = render(<Block win={win} active={false} />);
    expect(container.querySelector('[data-design-shield]')).not.toBeNull();
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  test('Code opens a live-linked editor beside the block, and edits flow back', async () => {
    const win = seedBlock();
    const { container } = render(<Block win={win} />);
    fireEvent.click(screen.getByRole('button', { name: 'Code' }));

    const state = useWorkspaceStore.getState();
    const editor = state.wins.find(w => w.kind === 'code_editor');
    expect(editor).toMatchObject({ code: win.source, fileName: 'hero.html', x: 932, y: 50 });
    expect(state.wins.find(w => w.id === win.id).sourceWindowId).toBe(editor.id);

    act(() => useWorkspaceStore.getState().onUpdate(editor.id, { code: '<main>Edited in the editor</main>' }));
    await waitFor(() => expect(container.querySelector('iframe').getAttribute('srcdoc')).toContain('Edited in the editor'));
    await waitFor(() => expect(useWorkspaceStore.getState().wins.find(w => w.id === win.id).source).toBe('<main>Edited in the editor</main>'));
  });

  test('Remix with AI rewrites the code with the chosen model, and Undo restores it', async () => {
    const win = seedBlock();
    global.fetch = jest.fn(() => json({ source: '<main class="dark">Dark hero</main>', sourceType: 'html' }));
    const { container } = render(<Block win={win} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remix with AI' }));
    fireEvent.change(screen.getByLabelText('Model provider'), { target: { value: 'openrouter' } });
    fireEvent.change(screen.getByPlaceholderText(/Describe the change/), { target: { value: 'make it dark' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(container.querySelector('iframe').getAttribute('srcdoc')).toContain('Dark hero'));
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(global.fetch.mock.calls[0][0]).toBe('/api/design/remix');
    expect(body).toMatchObject({ source: win.source, sourceType: 'html', instruction: 'make it dark', modelProvider: 'openrouter', modelName: 'openrouter/auto' });

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(container.querySelector('iframe').getAttribute('srcdoc')).toContain('Hello canvas'));
  });

  test('Figma blocks can flip to Figma\'s own render, and the frame can be turned back on', () => {
    const win = seedBlock({ renderUrl: 'https://render.figma.example/1:2.png' });
    render(<Block win={win} />);
    fireEvent.click(screen.getByRole('button', { name: 'Live code' }));
    expect(screen.getByRole('img', { name: 'Hero' })).toHaveAttribute('src', 'https://render.figma.example/1:2.png');
    fireEvent.click(screen.getByRole('button', { name: 'Borderless' }));
    expect(useWorkspaceStore.getState().wins[0]).toMatchObject({ bare: false, frameless: false });
  });
});

describe('Figma window', () => {
  function routes(handlers) {
    global.fetch = jest.fn((url, init = {}) => {
      const key = `${init.method || 'GET'} ${String(url).split('?')[0]}`;
      const handler = handlers[key];
      if (!handler) throw new Error(`unexpected fetch ${key}`);
      return handler(url, init);
    });
  }

  function FigmaHarness({ id }) {
    const win = useWorkspaceStore(state => state.wins.find(w => w.id === id));
    const onUpdate = React.useCallback((patch) => useWorkspaceStore.getState().onUpdate(id, patch), [id]);
    return <FigmaWindow win={win} onUpdate={onUpdate} />;
  }

  function seedFigma(props = {}) {
    act(() => useWorkspaceStore.setState({ wins: [{ id: 'fig-1', kind: 'figma', type: 'figma', x: 0, y: 0, w: 640, h: 560, ...props }] }));
  }

  test('connects a personal token through the key vault', async () => {
    let connected = false;
    routes({
      'GET /api/design/figma/status': () => json(connected ? { connected: true, source: 'byok', user: 'Alex Designer' } : { connected: false, source: null, user: null }),
      'POST /api/keys': (_url, init) => { connected = true; expect(JSON.parse(init.body)).toEqual({ provider: 'figma', apiKey: 'figd_secret_token' }); return json({ ok: true }); },
    });
    seedFigma();
    render(<FigmaHarness id="fig-1" />);
    fireEvent.change(await screen.findByLabelText('Figma personal access token'), { target: { value: 'figd_secret_token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect Figma' }));
    expect(await screen.findByText(/Connected as Alex Designer/)).toBeInTheDocument();
    expect(screen.getByLabelText('Figma file link')).toBeInTheDocument();
  });

  test('lists frames and places the picked ones on the canvas as borderless design blocks', async () => {
    routes({
      'GET /api/design/figma/status': () => json({ connected: true, source: 'byok', user: 'Alex Designer' }),
      'GET /api/design/figma/frames': () => json({
        name: 'Landing Page',
        frames: [
          { id: '1:2', name: 'Hero', page: 'Web', width: 1440, height: 900, thumbnailUrl: 'https://render.figma.example/1:2.png' },
          { id: '3:1', name: 'Home / iPhone', page: 'Mobile', width: 390, height: 844, thumbnailUrl: null },
        ],
      }),
      'POST /api/design/figma/import': (_url, init) => {
        const { nodeId } = JSON.parse(init.body);
        const name = nodeId === '1:2' ? 'Hero' : 'Home / iPhone';
        return json({ fileKey: 'AbC123xyz', nodeId, name, fileName: 'Landing Page', width: nodeId === '1:2' ? 1440 : 390, height: 844, html: `<main data-name="${name}">${name}</main>`, renderUrl: `https://render.figma.example/${nodeId}.png` });
      },
    });
    seedFigma();
    render(<FigmaHarness id="fig-1" />);
    fireEvent.change(await screen.findByLabelText('Figma file link'), { target: { value: FILE_URL } });
    fireEvent.click(screen.getByRole('button', { name: 'Show frames' }));
    fireEvent.click(await screen.findByRole('button', { name: /Hero/ }));
    fireEvent.click(screen.getByRole('button', { name: /Home \/ iPhone/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Place 2 on canvas' }));

    await waitFor(() => expect(useWorkspaceStore.getState().wins.filter(w => w.kind === 'designBlock')).toHaveLength(2));
    const [hero, phone] = useWorkspaceStore.getState().wins.filter(w => w.kind === 'designBlock');
    expect(hero).toMatchObject({
      title: 'Hero', source: '<main data-name="Hero">Hero</main>', sourceType: 'html', frameless: true, bare: true,
      x: 704, y: 0, w: 1440, h: 900, renderUrl: 'https://render.figma.example/1:2.png',
      figma: { fileKey: 'AbC123xyz', nodeId: '1:2', fileName: 'Landing Page', url: FILE_URL },
    });
    expect(phone).toMatchObject({ title: 'Home / iPhone', x: 704 + 1440 + 64, w: 390, h: 844 });
    expect(useWorkspaceStore.getState().wins.find(w => w.id === 'fig-1').figmaFileUrl).toBe(FILE_URL);
  });

  test('a Figma link pasted on the canvas loads its frames right away, with the linked frame picked', async () => {
    routes({
      'GET /api/design/figma/status': () => json({ connected: true, source: 'server', user: null }),
      'GET /api/design/figma/frames': () => json({ name: 'Landing Page', frames: [{ id: '1:2', name: 'Hero', page: 'Web', width: 1440, height: 900 }] }),
    });
    seedFigma({ figmaMode: 'import', figmaFileUrl: `${FILE_URL}?node-id=1-2` });
    render(<FigmaHarness id="fig-1" />);
    expect(await screen.findByRole('button', { name: 'Place 1 on canvas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hero/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('old embed windows keep working in view-only mode', async () => {
    routes({ 'GET /api/design/figma/status': () => json({ connected: false, source: null, user: null }) });
    seedFigma({ url: `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(FILE_URL)}`, figmaTitle: 'Landing Page' });
    render(<FigmaHarness id="fig-1" />);
    expect(screen.getByRole('tab', { name: 'View only' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Change File' })).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });
});

test('imported frames line up to the right of the Figma window', () => {
  expect(layoutImportedFrames({ x: 10, y: 20, w: 600 }, [{ width: 300, height: 5000 }, { width: 200, height: 100 }])).toEqual([
    { pos: { x: 674, y: 20 }, size: { w: 300, h: 1200 } },
    { pos: { x: 1038, y: 20 }, size: { w: 200, h: 100 } },
  ]);
});

test('a bare window has no border, panel or shadow; a plain frameless one keeps its hairline', () => {
  const frame = (win, isActive = false) => render(
    <WindowFrame win={{ id: win.id, x: 0, y: 0, w: 300, h: 200, frameless: true, ...win }} onUpdate={() => {}} onClose={() => {}} onSelect={() => {}} isActive={isActive} allWins={[]}>
      <div>content</div>
    </WindowFrame>,
  ).container.querySelector(`[data-win-id="${win.id}"]`);

  const bare = frame({ id: 'bare', bare: true });
  expect(bare.style.border).toContain('transparent');
  expect(bare.style.background).toBe('transparent');
  expect(bare.style.boxShadow).toBe('none');

  const selected = frame({ id: 'bare-active', bare: true }, true);
  expect(selected.style.background).toBe('transparent');
  expect(selected.style.border).not.toContain('transparent');

  expect(frame({ id: 'frameless' }).style.border).toContain('var(--hairline)');
});

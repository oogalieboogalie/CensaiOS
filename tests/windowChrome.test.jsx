/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { jest } from '@jest/globals';
import { ThemeProvider } from '../src/components/Theme.jsx';
import { WindowFrame, WindowTitle } from '../src/components/Windows.jsx';
import { WindowStyleMenu } from '../src/components/windows/WindowStyleMenu.jsx';

function renderFrame({ theme, onUpdate = jest.fn(), onClose = jest.fn(), titleAction } = {}) {
  if (theme) {
    localStorage.setItem('homebase.theme.v1', JSON.stringify(theme));
  }

  const frame = React.createElement(
    WindowFrame,
    {
      win: { id: 'chrome-test', kind: 'todos', x: 0, y: 0, w: 320, h: 360 },
      onUpdate,
      onClose,
      onSelect: jest.fn(),
      isActive: true,
      allWins: [],
    },
    React.createElement(
      WindowTitle,
      { label: 'Project To-Dos', subtitle: 'A deliberately long narrow-window subtitle' },
      titleAction
        ? React.createElement('button', { type: 'button', onClick: titleAction }, 'Title action')
        : null,
    ),
  );

  return render(theme ? React.createElement(ThemeProvider, null, frame) : frame);
}

describe('shared window header', () => {
  afterEach(() => {
    localStorage.clear();
  });

  test('one header row in the window body color, with hover controls on the right', () => {
    const onUpdate = jest.fn();
    const onClose = jest.fn();
    const titleAction = jest.fn();
    const { container } = renderFrame({ onUpdate, onClose, titleAction });

    const frame = container.querySelector('[data-window-chrome="low-profile"]');
    const headers = container.querySelectorAll('.hb-win-header');
    const header = headers[0];
    const subtitle = screen.getByText(/deliberately long narrow-window subtitle/i);

    expect(headers).toHaveLength(1);
    expect(frame).toHaveAttribute('data-header-mode', 'strip');
    expect(header).toHaveAttribute('data-traffic-controls', 'false');
    // The window's title is portaled into the frame's header, not drawn by the window.
    expect(header).toContainElement(screen.getByText('Project To-Dos'));
    expect(header).toContainElement(subtitle);
    expect(subtitle).toHaveClass('hb-win-subtitle');
    expect(header.querySelector('[data-window-actions]')).toContainElement(screen.getByRole('button', { name: 'Title action' }));

    fireEvent.click(screen.getByTitle('Close window'));
    fireEvent.click(screen.getByTitle('Maximize window'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pin to screen', hidden: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Title action' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenNthCalledWith(1, { maximized: true });
    expect(onUpdate).toHaveBeenNthCalledWith(2, { pinned: true });
    expect(titleAction).toHaveBeenCalledTimes(1);
  });

  test('the header is the drag target and double-click maximizes; its buttons do not drag', () => {
    const onUpdate = jest.fn();
    renderFrame({ onUpdate, titleAction: jest.fn() });

    const dragTarget = screen.getByTitle(/drag to move/i);
    const firePointer = (target, type, clientX, clientY, extra = {}) => {
      const event = new MouseEvent(type, { bubbles: true, clientX, clientY, ...extra });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      fireEvent(target, event);
    };
    firePointer(dragTarget, 'pointerdown', 100, 100);
    firePointer(dragTarget, 'pointermove', 148, 136);
    firePointer(dragTarget, 'pointerup', 148, 136);
    expect(onUpdate).toHaveBeenCalledWith({ x: 48, y: 36 });

    onUpdate.mockClear();
    const action = screen.getByRole('button', { name: 'Title action' });
    firePointer(action, 'pointerdown', 100, 100);
    firePointer(action, 'pointermove', 160, 160);
    firePointer(action, 'pointerup', 160, 160);
    expect(onUpdate).not.toHaveBeenCalled();

    fireEvent.doubleClick(dragTarget);
    expect(onUpdate).toHaveBeenCalledWith({ maximized: true });
  });

  test('Alt-drag moves the window from inside its content', () => {
    const onUpdate = jest.fn();
    render(
      React.createElement(WindowFrame, {
        win: { id: 'alt', kind: 'todos', x: 0, y: 0, w: 320, h: 360 },
        onUpdate, onClose: jest.fn(), onSelect: jest.fn(), isActive: true, allWins: [],
      }, React.createElement('p', null, 'Body text')),
    );
    const body = screen.getByText('Body text');
    const fire = (type, x, y, altKey) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, altKey });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      fireEvent(body, event);
    };
    fire('pointerdown', 10, 10, false);
    fire('pointermove', 50, 50, false);
    fire('pointerup', 50, 50, false);
    expect(onUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ x: expect.any(Number) }));

    fire('pointerdown', 10, 10, true);
    fire('pointermove', 40, 30, true);
    fire('pointerup', 40, 30, true);
    expect(onUpdate).toHaveBeenCalledWith({ x: 30, y: 20 });
  });

  test('more than three actions overflow into the window menu', () => {
    const actions = ['One', 'Two', 'Three', 'Four', 'Five'].map((label) => ({ id: label, label, onSelect: jest.fn() }));
    const { container } = render(
      React.createElement(WindowFrame, {
        win: { id: 'busy', kind: 'doc', x: 0, y: 0, w: 320, h: 360 },
        onUpdate: jest.fn(), onClose: jest.fn(), onSelect: jest.fn(), isActive: true, allWins: [],
      }, React.createElement(WindowTitle, { label: 'Busy', actions, menu: [{ id: 'graph', label: 'Show graph', onSelect: jest.fn() }] })),
    );
    const inline = container.querySelector('[data-window-actions]');
    const menu = container.querySelector('[data-window-menu]');
    expect([...inline.children].map((el) => el.textContent)).toEqual(['One', 'Two', 'Three']);
    expect([...menu.children].map((el) => el.textContent)).toEqual(['Four', 'Five', 'Show graph']);

    fireEvent.click(screen.getByTitle('More window actions'));
    expect(container.querySelector('.hb-win-menu')).not.toHaveAttribute('hidden');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Five' }));
    expect(actions[4].onSelect).toHaveBeenCalledTimes(1);
  });

  test('a window with no WindowTitle still gets its manifest title and icon', () => {
    const { container } = render(
      React.createElement(WindowFrame, {
        win: { id: 'market', kind: 'marketplace', x: 0, y: 0, w: 320, h: 360 },
        onUpdate: jest.fn(), onClose: jest.fn(), onSelect: jest.fn(), isActive: false, allWins: [],
      }, React.createElement('div', null, 'tabs')),
    );
    expect(container.querySelector('.hb-win-label')).toHaveTextContent('Marketplace');
    expect(container.querySelector('[data-window-identity] svg')).not.toBeNull();
  });

  test('header copy is plain text: emoji are stripped from titles', () => {
    render(
      React.createElement(WindowFrame, {
        win: { id: 'emoji', kind: 'todos', x: 0, y: 0, w: 320, h: 360 },
        onUpdate: jest.fn(), onClose: jest.fn(), onSelect: jest.fn(), isActive: false, allWins: [],
      }, React.createElement(WindowTitle, { label: '\u26A1 Vex Orchestrator' })),
    );
    expect(screen.getByText('Vex Orchestrator')).toHaveClass('hb-win-label');
  });

  test('focus is a hairline and stronger shadow, not a glow ring', () => {
    const frame = (isActive) => render(
      React.createElement(WindowFrame, {
        win: { id: `focus-${isActive}`, kind: 'todos', x: 0, y: 0, w: 320, h: 360 },
        onUpdate: jest.fn(), onClose: jest.fn(), onSelect: jest.fn(), isActive, allWins: [],
      }),
    ).container.querySelector('[data-win-frame]');
    const active = frame(true);
    const idle = frame(false);
    expect(active.style.border).toBe('1px solid var(--window-focus-hairline)');
    expect(active.style.boxShadow).toBe('var(--window-shadow-active, var(--elevation-3))');
    expect(idle.style.border).toBe('1px solid var(--hairline)');
    expect(idle.style.boxShadow).toBe('var(--window-shadow, var(--shadow-card))');
  });

  test('the theme header mode switches every window; a window can override it', () => {
    const { container } = renderFrame({ theme: { mood: 'graphite', headerMode: 'ghost' } });
    expect(container.querySelector('[data-win-frame]')).toHaveAttribute('data-header-mode', 'ghost');

    const onUpdate = jest.fn();
    const { container: own } = render(
      React.createElement(WindowFrame, {
        win: { id: 'own', kind: 'todos', x: 0, y: 0, w: 320, h: 360, headerMode: 'bare' },
        onUpdate, onClose: jest.fn(), onSelect: jest.fn(), isActive: true, allWins: [],
      }),
    );
    expect(own.querySelector('[data-win-frame]')).toHaveAttribute('data-header-mode', 'bare');
    fireEvent.click(within(own).getByRole('menuitemradio', { name: 'Strip', hidden: true }));
    expect(onUpdate).toHaveBeenCalledWith({ headerMode: 'strip' });
  });

  test('preserves left-side traffic lights for themes that explicitly request them', () => {
    const { container } = renderFrame({
      theme: { mood: 'apple-dark' },
    });

    const header = container.querySelector('.hb-win-header');
    expect(header).toHaveAttribute('data-traffic-controls', 'true');
    expect(header.querySelector('.hb-win-controls')).toContainElement(screen.getByTitle('Close window'));
  });

  test('frameless windows drop border and shadow until hovered', () => {
    const { container } = renderFrame({});
    const frame = container.querySelector('[data-window-chrome="low-profile"]');
    expect(frame.style.border).not.toContain('transparent');

    const { container: bare } = render(
      React.createElement(
        WindowFrame,
        {
          win: { id: 'chrome-bare', kind: 'todos', x: 0, y: 0, w: 320, h: 360, frameless: true },
          onUpdate: jest.fn(),
          onClose: jest.fn(),
          onSelect: jest.fn(),
          isActive: false,
          allWins: [],
        },
      )
    );
    const bareFrame = bare.querySelector('[data-window-chrome="low-profile"]');
    expect(bareFrame.style.border).toContain('var(--hairline)');
    expect(bareFrame.style.boxShadow).toBe('none');
    expect(bareFrame).toHaveAttribute('data-header-mode', 'ghost');
  });
});

describe('per-window chrome variants', () => {
  afterEach(() => {
    localStorage.clear();
  });

  function renderVariantFrame(chromeVariant, { isActive = true } = {}) {
    const win = { id: 'variant-test', kind: 'todos', x: 0, y: 0, w: 320, h: 360 };
    if (chromeVariant !== undefined) win.chromeVariant = chromeVariant;
    const { container } = render(
      React.createElement(
        WindowFrame,
        {
          win,
          onUpdate: jest.fn(),
          onClose: jest.fn(),
          onSelect: jest.fn(),
          isActive,
          allWins: [],
        },
        React.createElement(WindowTitle, { label: 'Variant' }),
      )
    );
    return container;
  }

  function renderStyleMenu(win) {
    const onUpdate = jest.fn();
    render(
      React.createElement(WindowStyleMenu, {
        win,
        theme: { hue: 225 },
        onUpdate,
        onClose: jest.fn(),
        colorMenuRef: React.createRef(),
      })
    );
    return onUpdate;
  }

  test('scopes the glass variant tokens inline on its own frame', () => {
    const container = renderVariantFrame('glass');
    const frame = container.querySelector('[data-window-chrome="low-profile"]');
    expect(frame).toHaveAttribute('data-chrome-variant', 'glass');
    expect(frame.style.getPropertyValue('--window-radius')).toBe('var(--radius-card)');
    expect(frame.style.getPropertyValue('--window-control-idle-opacity')).toBe('0');
    expect(frame.style.getPropertyValue('--window-shadow')).toContain('var(--accent)');
    expect(frame.style.getPropertyValue('--window-shadow-active')).toContain('var(--accent)');
  });

  test('traffic-mac variant moves controls left per-window on the default mood', () => {
    const container = renderVariantFrame('traffic-mac');
    const header = container.querySelector('.hb-win-header');
    expect(header).toHaveAttribute('data-traffic-controls', 'true');
    expect(header.querySelector('.hb-win-controls')).toContainElement(screen.getByTitle('Close window'));
  });

  test('quiet variants inherit the theme radius instead of stomping it', () => {
    for (const id of ['glass', 'pill-tab', 'brutalist', 'ring', 'flat', 'clean']) {
      const container = renderVariantFrame(id);
      const frame = container.querySelector('[data-window-chrome="low-profile"]');
      expect(frame.style.getPropertyValue('--window-radius')).toBe('var(--radius-card)');
    }
  });

  test('unknown variant ids fall back to stock chrome', () => {
    const container = renderVariantFrame('nope-not-real');
    const frame = container.querySelector('[data-window-chrome="low-profile"]');
    expect(frame.style.getPropertyValue('--window-radius')).toBe('');
    expect(container.querySelector('.hb-win-header')).toHaveAttribute('data-traffic-controls', 'false');
  });

  test('style menu picker writes the variant onto the window', () => {
    const onUpdate = renderStyleMenu({ id: 'm', kind: 'todos' });
    const select = screen.getByLabelText('Chrome');
    expect(select.value).toBe('');
    fireEvent.change(select, { target: { value: 'ring' } });
    expect(onUpdate).toHaveBeenCalledWith({ chromeVariant: 'ring' });
  });

  test('style menu picker resets back to the theme default', () => {
    const onUpdate = renderStyleMenu({ id: 'm', kind: 'todos', chromeVariant: 'glass' });
    expect(screen.getByLabelText('Chrome').value).toBe('glass');
    fireEvent.change(screen.getByLabelText('Chrome'), { target: { value: '' } });
    expect(onUpdate).toHaveBeenCalledWith({ chromeVariant: undefined });
  });
});

describe('win98 headers', () => {
  afterEach(() => {
    localStorage.clear();
  });

  function render98({ isActive = true } = {}) {
    const { container } = render(
      React.createElement(
        WindowFrame,
        {
          win: { id: 'win98-test', kind: 'todos', x: 0, y: 0, w: 320, h: 360, chromeVariant: 'win98' },
          onUpdate: jest.fn(),
          onClose: jest.fn(),
          onSelect: jest.fn(),
          isActive,
          allWins: [],
        },
        React.createElement(WindowTitle, { label: 'My Computer', subtitle: 'C:' }),
      )
    );
    return container;
  }

  test('active window gets the win98 bar skin and its navy title token', () => {
    const container = render98({ isActive: true });
    const frame = container.querySelector('[data-win-frame]');
    const header = container.querySelector('.hb-win-header');
    expect(header).toHaveAttribute('data-chrome-header', 'win98');
    expect(frame).toHaveAttribute('data-active', 'true');
    expect(frame.style.getPropertyValue('--window-title-bg')).toContain('oklch');
    expect(header).toContainElement(screen.getByText('My Computer'));
  });

  test('inactive window marks itself inactive so the bar dims to gray', () => {
    const container = render98({ isActive: false });
    expect(container.querySelector('[data-win-frame]')).toHaveAttribute('data-active', 'false');
    expect(container.querySelector('.hb-win-header')).toHaveAttribute('data-chrome-header', 'win98');
  });

  test('controls ride inside the bar', () => {
    const container = render98({ isActive: true });
    const controls = container.querySelector('[data-chrome-header="win98"] .hb-win-controls');
    for (const title of ['Close window', 'Maximize window', 'More window actions']) {
      expect(controls).toContainElement(screen.getByTitle(title));
    }
  });
});

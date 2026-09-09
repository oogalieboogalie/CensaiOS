/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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

describe('low-profile window chrome', () => {
  afterEach(() => {
    localStorage.clear();
  });

  test('uses a compact title rail and conventional right-side controls by default', () => {
    const onUpdate = jest.fn();
    const onClose = jest.fn();
    const titleAction = jest.fn();
    const { container } = renderFrame({ onUpdate, onClose, titleAction });

    const frame = container.querySelector('[data-window-chrome="low-profile"]');
    const rail = container.querySelector('[data-window-title-rail="low-profile"]');
    const wash = container.querySelector('[data-window-title-wash]');
    const copy = container.querySelector('[data-window-title-copy]');
    const subtitle = screen.getByText(/deliberately long narrow-window subtitle/i);

    expect(frame).toBeInTheDocument();
    expect(rail).toHaveAttribute('data-traffic-controls', 'false');
    expect(rail.style.padding).toBe('6px 84px 6px 12px');
    expect(rail.style.minHeight).toBe('28px');
    expect(rail.style.borderBottomWidth).toBe('0px');
    expect(wash.style.opacity).toBe('0.28');
    expect(copy.style.overflow).toBe('hidden');
    expect(subtitle.style.whiteSpace).toBe('nowrap');
    expect(subtitle.style.textOverflow).toBe('ellipsis');

    const close = screen.getByTitle('Close window');
    const maximize = screen.getByTitle('Maximize window');
    const pin = screen.getByTitle('Pin to screen');
    expect(close.style.left).toBe('auto');
    expect(close.style.right).toBe('8px');
    expect(close.style.background).toBe('transparent');
    expect(maximize.style.right).toBe('32px');
    expect(pin.style.right).toBe('56px');

    fireEvent.click(close);
    fireEvent.click(maximize);
    fireEvent.click(pin);
    fireEvent.click(screen.getByRole('button', { name: 'Title action' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenNthCalledWith(1, { maximized: true });
    expect(onUpdate).toHaveBeenNthCalledWith(2, { pinned: true });
    expect(titleAction).toHaveBeenCalledTimes(1);
  });

  test('keeps the full drag target and double-click maximize behavior', () => {
    const onUpdate = jest.fn();
    renderFrame({ onUpdate });

    const dragTarget = screen.getByTitle(/drag to move/i);
    expect(dragTarget.style.height).toBe('30px');
    const firePointer = (type, clientX, clientY) => {
      const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      fireEvent(dragTarget, event);
    };
    firePointer('pointerdown', 100, 100);
    firePointer('pointermove', 148, 136);
    firePointer('pointerup', 148, 136);
    expect(onUpdate).toHaveBeenCalledWith({ x: 48, y: 36 });

    onUpdate.mockClear();
    fireEvent.doubleClick(dragTarget);
    expect(onUpdate).toHaveBeenCalledWith({ maximized: true });
  });

  test('preserves left-side traffic lights for themes that explicitly request them', () => {
    const { container } = renderFrame({
      theme: { mood: 'apple-dark' },
    });

    const rail = container.querySelector('[data-window-title-rail="low-profile"]');
    const close = screen.getByTitle('Close window');
    const pin = screen.getByTitle('Pin to screen');

    expect(rail).toHaveAttribute('data-traffic-controls', 'true');
    expect(rail.style.padding).toBe('6px 60px 6px 72px');
    expect(close.style.left).toBe('8px');
    expect(close.style.right).toBe('auto');
    expect(close.style.width).toBe('14px');
    expect(close.style.background).toBe('var(--ps-red)');
    expect(pin.style.right).toBe('8px');
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
    const rail = container.querySelector('[data-window-title-rail="low-profile"]');
    const close = screen.getByTitle('Close window');
    expect(rail).toHaveAttribute('data-traffic-controls', 'true');
    expect(rail.style.padding).toBe('6px 60px 6px 72px');
    expect(close.style.left).toBe('8px');
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
    expect(screen.getByTitle('Close window').style.right).toBe('8px');
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

  test('active window gets a solid navy bar with white bold text', () => {
    const container = render98({ isActive: true });
    const rail = container.querySelector('[data-window-title-rail="low-profile"]');
    const wash = container.querySelector('[data-window-title-wash]');
    expect(rail).toHaveAttribute('data-chrome-header', 'win98');
    expect(rail.style.color).toBe('oklch(1 0 0)');
    expect(rail.style.textTransform).toBe('none');
    expect(rail.style.minHeight).toBe('24px');
    expect(wash.style.opacity).toBe('1');
    expect(wash.style.background).toContain('--window-title-bg');
  });

  test('inactive window dims to a gray bar', () => {
    const container = render98({ isActive: false });
    const wash = container.querySelector('[data-window-title-wash]');
    expect(wash.style.opacity).toBe('1');
    expect(wash.style.background).toContain('--hairline');
  });

  test('controls ride inside the bar as raised squares', () => {
    render98({ isActive: true });
    const close = screen.getByTitle('Close window');
    const maximize = screen.getByTitle('Maximize window');
    const pin = screen.getByTitle('Pin to screen');
    for (const btn of [close, maximize, pin]) {
      expect(btn.style.borderRadius).toBe('0');
      expect(btn.style.boxShadow).toContain('inset');
      expect(btn.style.opacity).toBe('1');
    }
    expect(close.style.right).toBe('6px');
    expect(maximize.style.right).toBe('28px');
    expect(pin.style.right).toBe('50px');
  });
});

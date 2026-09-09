import { jest } from '@jest/globals';
import {
  getChromeWindowControlState,
  runChromeCloseAction,
  runChromeMaximizeAction,
  runChromeMinimizeAction,
} from '../src/app/chromeWindowControls.js';

describe('chrome window controls', () => {
  test('uses window-specific titles when a window is active', () => {
    const state = getChromeWindowControlState({
      wins: [{ id: 'win-1', pinned: false, maximized: false }],
      activeId: 'win-1',
      focusMode: false,
    });

    expect(state.showWindowMaximize).toBe(true);
    expect(state.minimizeTitle).toBe('Pin selected window');
    expect(state.maximizeTitle).toBe('Maximize selected window');
    expect(state.closeTitle).toBe('Close selected window');
  });

  test('falls back to focus mode copy when no window is active', () => {
    const state = getChromeWindowControlState({
      wins: [{ id: 'win-1', pinned: false, maximized: false }],
      activeId: null,
      focusMode: true,
    });

    expect(state.showWindowMaximize).toBe(false);
    expect(state.maximizeTitle).toBe('Exit focus mode');
  });

  test('minimize action toggles pinned on the active window', () => {
    const onUpdate = jest.fn();

    const handled = runChromeMinimizeAction({
      wins: [{ id: 'win-1', pinned: false }],
      activeId: 'win-1',
      onUpdate,
    });

    expect(handled).toBe(true);
    expect(onUpdate).toHaveBeenCalledWith('win-1', { pinned: true });
  });

  test('maximize action toggles the active window before falling back to focus mode', () => {
    const onUpdate = jest.fn();
    const onToggleFocus = jest.fn();

    const result = runChromeMaximizeAction({
      wins: [{ id: 'win-1', maximized: false }],
      activeId: 'win-1',
      onUpdate,
      onToggleFocus,
    });

    expect(result).toBe('window');
    expect(onUpdate).toHaveBeenCalledWith('win-1', { maximized: true });
    expect(onToggleFocus).not.toHaveBeenCalled();
  });

  test('maximize action falls back to focus mode with no active window', () => {
    const onUpdate = jest.fn();
    const onToggleFocus = jest.fn();

    const result = runChromeMaximizeAction({
      wins: [],
      activeId: null,
      onUpdate,
      onToggleFocus,
    });

    expect(result).toBe('focus');
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onToggleFocus).toHaveBeenCalledTimes(1);
  });

  test('close action targets the active window', () => {
    const onClose = jest.fn();

    const handled = runChromeCloseAction({
      activeId: 'win-1',
      onClose,
    });

    expect(handled).toBe(true);
    expect(onClose).toHaveBeenCalledWith('win-1');
  });
});

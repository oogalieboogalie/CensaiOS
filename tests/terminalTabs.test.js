import {
  terminalTabs, activeTerminalTabId, tabSessionId, tabLabel,
  addTerminalTab, closeTerminalTab, switchTerminalTab,
} from '../src/components/terminal/terminalTabs.js';
import { terminalFont, glowTheme, GLOW_FONT_SCALE } from '../src/components/terminal/terminalGlow.js';
import { terminalTabKeyAction } from '../src/components/terminal/TerminalTabBar.jsx';

describe('terminal tabs', () => {
  const win = { id: 'w1' };

  test('a window saved before tabs has one tab on its old shell', () => {
    expect(terminalTabs(win)).toEqual([{ id: 'main' }]);
    expect(activeTerminalTabId(win)).toBe('main');
    expect(tabSessionId(win, { id: 'main' })).toBe('w1');
    expect(tabSessionId({ ...win, agentSessionId: 's9' }, { id: 'main' })).toBe('s9');
  });

  test('a new tab gets its own shell and comes to the front', () => {
    const change = addTerminalTab(win);
    expect(change.terminalTabs).toHaveLength(2);
    expect(change.activeTerminalTab).toBe(change.terminalTabs[1].id);
    const next = { ...win, ...change };
    expect(tabSessionId(next, change.terminalTabs[1])).toBe(`w1-tab-${change.terminalTabs[1].id}`);
    expect(tabLabel(next, change.terminalTabs[1], 1)).toBe('Shell 2');
  });

  test('closing the front tab shows its neighbour; the last tab stays', () => {
    const w = { ...win, terminalTabs: [{ id: 'main' }, { id: 'a' }, { id: 'b' }], activeTerminalTab: 'a' };
    expect(closeTerminalTab(w, 'a')).toEqual({ terminalTabs: [{ id: 'main' }, { id: 'b' }], activeTerminalTab: 'b' });
    expect(closeTerminalTab(w, 'b').activeTerminalTab).toBe('a');
    expect(closeTerminalTab(win, 'main')).toBeNull();
  });

  test('switching wraps around', () => {
    const w = { ...win, terminalTabs: [{ id: 'main' }, { id: 'a' }], activeTerminalTab: 'a' };
    expect(switchTerminalTab(w, 1)).toEqual({ activeTerminalTab: 'main' });
    expect(switchTerminalTab(w, -1)).toEqual({ activeTerminalTab: 'main' });
  });

  test('the first tab of an Alt hotkey window is named after its tool', () => {
    expect(tabLabel({ ...win, launchCli: 'claudecode' }, { id: 'main' }, 0)).toBe('Claude Code');
  });

  test('Windows Terminal keys', () => {
    expect(terminalTabKeyAction({ ctrlKey: true, shiftKey: true, key: 'T' })).toBe('add');
    expect(terminalTabKeyAction({ ctrlKey: true, shiftKey: true, key: 'W' })).toBe('close');
    expect(terminalTabKeyAction({ ctrlKey: true, key: 'Tab' })).toBe('next');
    expect(terminalTabKeyAction({ ctrlKey: true, shiftKey: true, key: 'Tab' })).toBe('prev');
    expect(terminalTabKeyAction({ ctrlKey: true, key: 'c' })).toBeNull();
    expect(terminalTabKeyAction({ shiftKey: true, key: 'T' })).toBeNull();
  });
});

describe('terminal glow look', () => {
  test('uses the pixel font, a little bigger', () => {
    expect(terminalFont(true, 13, 1).fontFamily).toMatch(/VT323/);
    expect(terminalFont(true, 13, 1).fontSize).toBe(Math.round(13 * GLOW_FONT_SCALE));
    expect(terminalFont(false, 13, 1)).toEqual({ fontFamily: expect.stringMatching(/JetBrains/), fontSize: 13, fontWeightBold: 'bold' });
    expect(terminalFont(true, 13, 1).fontWeightBold).toBe('normal');
  });

  test('brings neon colors unless the window picked its own', () => {
    const picked = { background: '#111111' };
    expect(glowTheme(picked, {})).toBe(picked);
    expect(glowTheme(null, { fontSize: 14 })).toMatchObject({ fontSize: 14, green: expect.any(String) });
  });
});

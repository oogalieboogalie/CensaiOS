import {
  AGENT_HOTKEY_ACTIONS, parseHotkey, hotkeyFromEvent, mergeAgentHotkeys, defaultAgentHotkeys,
  assignAgentHotkey, actionForEvent,
} from '../src/lib/agentHotkeys.js';
import { hotkeyFolder } from '../src/lib/windowProject.js';

const key = (code, extra = {}) => ({ altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, code, ...extra });

test('defaults: Alt+C Claude Code, Alt+Shift+C Codex, Alt+G Copilot', () => {
  const map = defaultAgentHotkeys();
  expect(map.claudecode).toBe('Alt+C');
  expect(map.codex).toBe('Alt+Shift+C');
  expect(map.copilot).toBe('Alt+G');
  expect(new Set(Object.values(map)).size).toBe(AGENT_HOTKEY_ACTIONS.length);
});

test('only Alt + a letter (Shift optional) can be a hotkey', () => {
  expect(parseHotkey('alt+shift+c')).toEqual({ shift: true, letter: 'C' });
  expect(parseHotkey('Alt+1')).toBeNull();
  expect(parseHotkey('Ctrl+C')).toBeNull();
  expect(parseHotkey('Alt+Ctrl+C')).toBeNull();
  expect(parseHotkey('C')).toBeNull();
});

test('reads the physical key, so Option+C on a Mac still means C', () => {
  expect(hotkeyFromEvent(key('KeyC', { key: 'ç' }))).toBe('Alt+C');
  expect(hotkeyFromEvent(key('KeyC', { shiftKey: true }))).toBe('Alt+Shift+C');
  expect(hotkeyFromEvent(key('Digit1'))).toBe('');
  expect(hotkeyFromEvent(key('KeyC', { ctrlKey: true }))).toBe('');
  expect(hotkeyFromEvent({ ...key('KeyC'), altKey: false })).toBe('');
});

test('saved choices win, bad ones fall back, off stays off', () => {
  const map = mergeAgentHotkeys({ claudecode: 'Alt+K', codex: '', copilot: 'Ctrl+G' });
  expect(map.claudecode).toBe('Alt+K');
  expect(map.codex).toBe('');
  expect(map.copilot).toBe('Alt+G');
});

test('taking a key from another agent turns the other one off', () => {
  const next = assignAgentHotkey(defaultAgentHotkeys(), 'opencode', 'Alt+C');
  expect(next.opencode).toBe('Alt+C');
  expect(next.claudecode).toBe('');
  expect(assignAgentHotkey(next, 'opencode', 'Ctrl+X')).toBe(next);
});

test('a keydown finds its action', () => {
  const map = defaultAgentHotkeys();
  expect(actionForEvent(map, key('KeyC')).cli).toBe('claudecode');
  expect(actionForEvent(map, key('KeyG')).cli).toBe('copilot');
  expect(actionForEvent(map, key('KeyT', { shiftKey: true })).cli).toBeNull();
  expect(actionForEvent(map, key('KeyQ'))).toBeNull();
});

describe('the folder a hotkey terminal starts in', () => {
  const boardDefault = { type: 'local', name: 'censaiOS', path: '/p/censaios' };
  const wins = [
    { id: 'files-a', kind: 'files', dirPath: '/p/shop', x: 0, y: 0, w: 300, h: 300 },
    { id: 'term-b', kind: 'terminal', cwd: '/p/blog', x: 400, y: 0, w: 300, h: 300 },
    { id: 'note', kind: 'note', x: 800, y: 0, w: 200, h: 200 },
  ];
  test('follows the project of the window in use', () => {
    expect(hotkeyFolder({ wins, activeId: 'files-a', currentProject: boardDefault })).toBe('/p/shop');
    expect(hotkeyFolder({ wins, activeId: 'term-b', currentProject: boardDefault })).toBe('/p/blog');
  });
  test('falls back to the board default', () => {
    expect(hotkeyFolder({ wins, activeId: 'note', currentProject: boardDefault })).toBe('/p/censaios');
    expect(hotkeyFolder({ wins, activeId: null, currentProject: boardDefault })).toBe('/p/censaios');
    expect(hotkeyFolder({ wins: [], currentProject: null })).toBe('');
  });
});

/** @jest-environment jsdom */
import { getTerminalSocketUrl } from '../src/components/terminal/terminalInteractions.js';

test('terminal socket URL carries workspace scope with the client window id', () => {
  window.history.replaceState({}, '', 'http://localhost/canvas');
  const url = new URL(getTerminalSocketUrl('C:\\repo', 'window-1', 'workspace-a'));
  expect(url.pathname).toBe('/api/terminal');
  expect(url.searchParams.get('cwd')).toBe('C:\\repo');
  expect(url.searchParams.get('sessionId')).toBe('window-1');
  expect(url.searchParams.get('workspaceId')).toBe('workspace-a');
});

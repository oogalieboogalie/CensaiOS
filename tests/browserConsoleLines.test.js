import fs from 'node:fs';
import path from 'node:path';
import { logFailure, pendingAppLog } from '../src/lib/appLog/browserLog.js';

test('a handled board failure goes to the app log as a fixed line with the error kind only', () => {
  const err = new TypeError('made-up secret note from Pat: api_key=sk-madeup123');
  logFailure('context-feed: could not load the feed', err, 'contextFeed', 'error');
  const line = pendingAppLog().find((e) => e.message === 'context-feed: could not load the feed');
  expect(line).toMatchObject({ level: 'error', where: 'contextFeed', detail: 'TypeError' });
  expect(JSON.stringify(pendingAppLog())).not.toContain('sk-madeup123');
});

test('the eight board files that printed to the console now write to the app log', () => {
  const files = ['lib/storePresetActions.js', 'lib/nativeBrowserPane.js', 'components/windows/windowRegistry.js',
    'components/overseer/useOverseer.js', 'components/github/useGithubConsole.js', 'components/SovereignTestWindow.jsx',
    'components/MlopsDashboardWindow.jsx', 'components/ContextFeedWindow.jsx'];
  for (const file of files) {
    const source = fs.readFileSync(path.resolve('src', file), 'utf8');
    expect({ file, console: (source.match(/console\.(log|warn|error|info|debug)\(/g) || []).length }).toEqual({ file, console: 0 });
    expect(source).toMatch(/appLog\/browserLog\.js/);
  }
});

/**
 * @jest-environment jsdom
 */
import fs from 'node:fs';
import path from 'node:path';
import { jest } from '@jest/globals';
import { pendingAppLog } from '../src/lib/appLog/browserLog.js';
import { ErrorBoundary } from '../src/components/ErrorBoundary.jsx';
import { WindowLazyErrorBoundary } from '../src/components/windows/WindowLazyErrorBoundary.jsx';
import { emitBoardEvent, onBoardEvent } from '../src/lib/collaboration/boardEvents.js';
import { getAttributes } from '../src/lib/api/attributes.js';

// Item 136: the last board lines that only printed to the browser console now
// leave one fixed app-log line under their window's name, with the error's
// kind and never its text.
const SECRET = 'made-up note from Pat: api_key=sk-madeup123';
const lineFor = (message) => pendingAppLog().filter((e) => e.message === message);

beforeEach(() => { global.fetch = jest.fn().mockRejectedValue(new TypeError(SECRET)); });

test('both error boundaries write one error-boundary line', () => {
  const crash = (Boundary, props, err) => {
    const boundary = new Boundary(props);
    boundary.setState = () => {}; // not mounted; only the log line matters here
    boundary.componentDidCatch(err, { componentStack: '' });
  };
  crash(ErrorBoundary, {}, new RangeError(SECRET));
  crash(WindowLazyErrorBoundary, { type: 'doc' }, new SyntaxError(SECRET));
  expect(lineFor('error-boundary: the app crashed while drawing')).toEqual([expect.objectContaining({ level: 'error', where: 'error-boundary', detail: 'RangeError' })]);
  expect(lineFor('error-boundary: a window crashed while drawing')).toEqual([expect.objectContaining({ where: 'error-boundary', detail: 'SyntaxError' })]);
});

test('a failing board event listener and a failed attribute load each write one line', async () => {
  const stop = onBoardEvent('made-up', () => { throw new EvalError(SECRET); });
  emitBoardEvent({ type: 'made-up' });
  stop?.();
  expect(lineFor('board-events: a listener failed')).toEqual([expect.objectContaining({ where: 'board-events', detail: 'EvalError' })]);
  expect(await getAttributes()).toEqual({ attributes: [] });
  expect(lineFor('attributes: could not load attributes')).toEqual([expect.objectContaining({ where: 'attributes', detail: 'TypeError' })]);
  expect(JSON.stringify(pendingAppLog())).not.toContain('sk-madeup123');
});

test('only the sandbox scripts and sample code still name the console in src', () => {
  const left = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.jsx?$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name)
        && /\bconsole\.(log|warn|error|info)\s*\(/.test(fs.readFileSync(file, 'utf8'))) left.push(file.split(path.sep).join('/'));
    }
  };
  walk('src');
  expect(left.sort()).toEqual([
    'src/components/CodeEditorWindow.jsx', // sample code text in a new editor
    'src/components/canvas/CanvasState.js', // the same sample code text
    'src/lib/modules/moduleSdkClient.js', // runs inside a module's sandbox
    'src/lib/yorware/threeEditor/sandbox/shims.js', // runs inside the 3D editor's sandbox
  ]);
});

/**
 * @jest-environment jsdom
 */
/**
 * Self-fix, browser side: errors and failed /api calls are reported once,
 * with labels of recent clicks but never what was typed.
 */
import { jest } from '@jest/globals';

let sent;

beforeAll(async () => {
  sent = [];
  window.fetch = jest.fn(async (url, init) => {
    if (url === '/api/self-fix/reports') sent.push(JSON.parse(init.body));
    return { status: String(url).includes('/api/boom') ? 500 : 200 };
  });
  const { installSelfFixReporter } = await import('../src/lib/selfFix/reporter.js');
  installSelfFixReporter();
});

beforeEach(() => { sent.length = 0; });

test('a failed /api call is reported with the click before it; typed text is not', async () => {
  document.body.innerHTML = '<div data-win-kind="music"><input id="q" value="my secret"><button>Play</button></div>';
  document.querySelector('#q').click();
  document.querySelector('button').click();
  await window.fetch('/api/boom?x=1', { method: 'POST' });
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ kind: 'api-failed', method: 'POST', status: 500 });
  const labels = sent[0].actions.map((a) => a.label);
  expect(labels).toEqual(expect.arrayContaining(['input field', 'Play']));
  expect(JSON.stringify(sent[0])).not.toContain('my secret');
  expect(sent[0].actions.find((a) => a.label === 'Play').windowKind).toBe('music');
});

test('the same error twice in a minute is sent once; self-fix calls never report themselves', async () => {
  const { reportError } = await import('../src/lib/selfFix/reporter.js');
  reportError({ kind: 'window-crash', error: new Error('same'), windowKind: 'music' });
  reportError({ kind: 'window-crash', error: new Error('same'), windowKind: 'music' });
  expect(sent).toHaveLength(1);
  await window.fetch('/api/self-fix/reports-boom');
  expect(sent).toHaveLength(1);
});

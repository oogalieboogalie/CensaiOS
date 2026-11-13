/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import { flushAppLog, formatArgs, installBrowserLog, logFailure, logToApp, pendingAppLog } from '../src/lib/appLog/browserLog.js';

describe('browserLog', () => {
  test('console styling is dropped from the line', () => {
    expect(formatArgs(['%c[chat]', 'color:#888', 'send failed', { status: 500 }])).toBe('[chat] send failed {"status":500}');
    expect(formatArgs([new Error('boom')])).toMatch(/^Error: boom/);
  });

  test('errors, warnings and failed /api calls are sent in one batch', async () => {
    jest.useFakeTimers();
    const sent = [];
    const target = new EventTarget();
    target.console = { error: jest.fn(), warn: jest.fn() };
    target.fetch = jest.fn(async (url, init) => {
      if (url === '/api/logs/browser') { sent.push(JSON.parse(init.body)); return { status: 202 }; }
      return { status: url.includes('missing') ? 404 : url.includes('made-up') ? 500 : 200 };
    });
    installBrowserLog(target);

    target.console.error('%c[todos]', 'color:#888', 'save failed');
    target.console.warn('slow answer');
    target.console.warn('slow answer'); // same line twice is kept once
    await target.fetch('/api/todos/missing?x=1', { method: 'post' });
    await target.fetch('/api/todos');
    await target.fetch('/api/logs/browser-missing'); // its own address is never logged
    // Run dev and Docker name things after a project's folder: the line keeps Run dev's hash, never the name.
    await target.fetch('/api/dev-servers/censai-dev-made-up-garden-plans-0123456789');
    await target.fetch('/api/docker/compose/made-up-garden-plans/up', { method: 'POST' });
    target.dispatchEvent(Object.assign(new Event('censai:board-error'), { detail: { message: 'Hand off refused', detail: 'POST /api/project-handoffs 403' } }));

    expect(pendingAppLog().map((e) => e.message)).toEqual([
      '[todos] save failed',
      'slow answer',
      'POST /api/todos/missing returned 404',
      'GET /api/dev-servers/censai-dev-[redacted]-0123456789 returned 500',
      'POST /api/docker/compose/[redacted]/up returned 500',
      'Hand off refused',
    ]);
    jest.advanceTimersByTime(3000);
    expect(sent).toHaveLength(1);
    expect(sent[0].entries).toHaveLength(6);
    expect(JSON.stringify(sent)).not.toMatch(/made-up|garden/);
    expect(sent[0].entries[0]).toMatchObject({ level: 'error' });
    expect(sent[0].entries[2]).toMatchObject({ level: 'warn' });
    expect(pendingAppLog()).toHaveLength(0);
    // The real console still printed everything.
    expect(target.console.warn).toBeDefined();
    jest.useRealTimers();
  });

  test('blank lines are not queued', () => {
    logToApp('warn', '   ');
    expect(pendingAppLog()).toHaveLength(0);
    flushAppLog();
  });

  test('a handled failure sends its kind, never its text', () => {
    logFailure('Made-up note not saved', Object.assign(new Error('Pat private note.md quota'), { name: 'QuotaExceededError' }), 'storage');
    logFailure('Made-up list not loaded', { name: 'not a kind <script>' }, 'memory', 'error');
    expect(pendingAppLog()).toEqual([
      expect.objectContaining({ level: 'warn', message: 'Made-up note not saved', detail: 'QuotaExceededError', where: 'storage' }),
      expect.objectContaining({ level: 'error', message: 'Made-up list not loaded', detail: '', where: 'memory' }),
    ]);
    expect(JSON.stringify(pendingAppLog())).not.toMatch(/Pat|private|quota/);
    pendingAppLog().length && flushAppLog();
  });

  test('the busiest board files no longer print raw console lines', async () => {
    const { readFileSync } = await import('node:fs');
    for (const file of ['src/lib/api/storage.js', 'src/lib/api/memory.js', 'src/components/theme/useThemePanel.js', 'src/components/doc/useDoc.js', 'src/app/hooks/useAppBootstrap.js']) {
      expect([file, readFileSync(file, 'utf8').match(/console\.(log|warn|error)\(/g)]).toEqual([file, null]);
    }
  });
});

/**
 * Self-fix: what leaves the logger (scrub), how errors group (fingerprint),
 * what a nobody-watching fix run may do (policy), and how the agent's
 * answer is read (workOrder).
 */
import { scrubText, scrubStack, scrubActions, fingerprint } from '../server/selfFix/scrub.js';
import { buildBundle, bundleText } from '../server/selfFix/bundle.js';
import { decidePermission, isSafeCommand } from '../server/selfFix/policy.js';
import { buildWorkOrder, readVerdict, looksExternal } from '../server/selfFix/workOrder.js';

describe('scrub', () => {
  test('keys, tokens, emails and secrets never survive', () => {
    const text = scrubText([
      'key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123 and sk-proj-ABCDEFGHIJKLMNOP1234',
      'gh ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345 tavily tvly-abcdef123456',
      'Authorization: Bearer abc.def.ghijklmnop password=hunter22 "apiKey": "AIzaSyA-1234567890abcdefghijk"',
      'mail alex@censai.app jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N',
      'db postgres://homebase:supersecret@127.0.0.1:5433/homebase',
    ].join('\n'));
    for (const secret of ['sk-ant-api03', 'sk-proj-ABC', 'ghp_ABC', 'tvly-abc', 'abc.def.ghij', 'hunter22', 'AIzaSy', 'alex@censai.app', 'eyJhbGci', 'supersecret']) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain('[email]');
  });

  test('paths stay readable but lose the account name; long text is cut', () => {
    expect(scrubText('at C:\\Users\\Alexa\\code\\x.js and /home/alex/Homebase/server/selfFix/scrub.js'))
      .toBe('at C:\\Users\\[user]\\code\\x.js and /home/[user]/Homebase/server/selfFix/scrub.js');
    expect(scrubText('x'.repeat(50), 10)).toBe('xxxxxxxxxx… [cut]');
  });

  test('stacks keep frames only; actions keep labels only', () => {
    const err = new Error('boom');
    const stack = scrubStack(`${err.stack}\nsome source line with secret=abc`, 3);
    expect(stack.split('\n')).toHaveLength(4);
    expect(stack).not.toContain('source line');
    const actions = scrubActions([{ type: 'click', label: 'Send to bob@x.com', windowKind: 'chat', typed: 'hello' }]);
    expect(actions[0]).toEqual({ at: null, type: 'click', label: 'Send to [email]', windowKind: 'chat' });
  });

  test('same error with different numbers and lines groups together; a different one does not', () => {
    const a = fingerprint({ kind: 'server-error', message: 'User 41 not found', stack: 'Error\n    at load (/x/a.js:10:5)' });
    const b = fingerprint({ kind: 'server-error', message: 'User 977 not found', stack: 'Error\n    at load (/x/a.js:12:9)' });
    const c = fingerprint({ kind: 'server-error', message: 'User 41 not found', stack: 'Error\n    at other (/x/b.js:10:5)' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('bundle', () => {
  test('carries the error, window, actions and log tail, scrubbed, as plain text', () => {
    const bundle = buildBundle({
      kind: 'window-crash', message: 'Cannot read x of undefined (key sk-ant-1234567890abcdefgh)', stack: new Error('t').stack,
      windowKind: 'musicPlayer', actions: [{ type: 'click', label: 'Play', windowKind: 'musicPlayer' }],
    }, { logLines: ['INFO [music] loaded token=abcdef123456'] });
    expect(bundle.title).toBe('The musicPlayer window crashed');
    const text = bundleText(bundle);
    expect(text).toContain('Window kind: musicPlayer');
    expect(text).toContain('- click: Play (in musicPlayer)');
    expect(text).not.toContain('sk-ant-1234567890');
    expect(text).not.toContain('abcdef123456');
  });

  test('unknown kinds fall back; failed requests get a plain title', () => {
    expect(buildBundle({ kind: 'nope', message: 'x' }).kind).toBe('browser-error');
    expect(buildBundle({ kind: 'api-failed', method: 'post', path: '/api/chat?x=1', status: 500, message: 'x' }).title)
      .toBe('POST /api/chat failed (500)');
  });
});

describe('policy (no pop-ups, so the rules answer instead)', () => {
  const dir = '/tmp/wt/abc';
  test('reads anywhere in the copy; edits only inside it, never .env, .git or node_modules', () => {
    expect(decidePermission({ tool: 'Read', input: { file_path: '/tmp/wt/abc/server/a.js' } }, dir).allow).toBe(true);
    expect(decidePermission({ tool: 'Read', input: { file_path: '/etc/passwd' } }, dir).allow).toBe(false);
    expect(decidePermission({ tool: 'Edit', input: { file_path: '/tmp/wt/abc/server/a.js' } }, dir).allow).toBe(true);
    expect(decidePermission({ tool: 'Write', input: { file_path: '/tmp/wt/other/a.js' } }, dir).allow).toBe(false);
    expect(decidePermission({ tool: 'Write', input: { file_path: '/tmp/wt/abc/.env' } }, dir).allow).toBe(false);
    expect(decidePermission({ tool: 'Edit', input: { file_path: '/tmp/wt/abc/node_modules/x/i.js' } }, dir).allow).toBe(false);
    expect(decidePermission({ tool: 'WebFetch', input: { url: 'https://x' } }, dir).allow).toBe(false);
    expect(decidePermission({ tool: 'SomethingNew', input: {} }, dir).allow).toBe(false);
  });

  test('commands: tests and read-only looks yes; installs, writes, network, git commits no', () => {
    for (const ok of [
      'node --experimental-vm-modules node_modules/jest/bin/jest.js tests/a.test.js',
      'npx jest tests/a.test.js 2>&1 | tail -20', 'git diff', 'grep -rn foo server | head', 'cd server && ls',
    ]) expect(isSafeCommand(ok)).toBe(true);
    for (const bad of [
      'npm install left-pad', 'git commit -am x', 'git push', 'curl https://x', 'rm -rf /', 'cat a > b',
      'echo $(whoami)', 'find . -delete', 'sed -i s/a/b/ x.js', 'ls; rm x', 'node -e "require(1)"',
    ]) expect(isSafeCommand(bad)).toBe(false);
    expect(decidePermission({ tool: 'Bash', input: { command: 'npm install x' } }, dir)).toMatchObject({ allow: false });
  });
});

describe('work order', () => {
  test('tells the agent to reproduce, fix small, test, stop, and answer in one line', () => {
    const order = buildWorkOrder(buildBundle({ kind: 'server-error', message: 'boom' }));
    expect(order).toMatch(/Reproduce/i);
    expect(order).toMatch(/Do not commit, push, install/);
    expect(order).toContain('SELF-FIX RESULT: FIXED');
  });

  test('reads the verdict line', () => {
    expect(readVerdict('done.\nSELF-FIX RESULT: FIXED - The music player opens again.')).toEqual({ fixed: true, sentence: 'The music player opens again.' });
    expect(readVerdict('SELF-FIX RESULT: NOT FIXED - Needs a key.')).toEqual({ fixed: false, sentence: 'Needs a key.' });
    expect(readVerdict('I changed some files')).toEqual({ fixed: false, sentence: null });
  });

  test('errors from the outside world are not sent to an agent', () => {
    expect(looksExternal({ kind: 'server-error', message: 'connect ECONNREFUSED 127.0.0.1:5433' })).toBe(true);
    expect(looksExternal({ kind: 'server-error', message: 'Provider said 429 rate limit' })).toBe(true);
    expect(looksExternal({ kind: 'api-failed', status: 503, message: 'x' })).toBe(true);
    expect(looksExternal({ kind: 'api-failed', status: 500, message: 'x' })).toBe(false);
    expect(looksExternal({ kind: 'window-crash', message: "Cannot read properties of undefined (reading 'map')" })).toBe(false);
  });
});

test('a window crash and the page\'s uncaught copy of it are one report', () => {
  const stack = 'TypeError: x\n    at skinFor (http://localhost:5173/src/components/music/musicSkins.js?t=1:161:42)';
  const page = fingerprint({ kind: 'browser-error', message: "Uncaught TypeError: Cannot read properties of undefined (reading 'toLowerCase')", stack });
  const win = fingerprint({ kind: 'window-crash', message: "Cannot read properties of undefined (reading 'toLowerCase')", stack });
  expect(page).toBe(win);
  expect(fingerprint({ kind: 'api-failed', message: 'x', path: '/api/a' })).not.toBe(fingerprint({ kind: 'browser-error', message: 'x', path: '/api/a' }));
});

/**
 * node-pty sanity guard.
 *
 * The terminal depends on the native `node-pty` module. The most dangerous
 * failure mode is the native binary breaking — e.g. an ABI mismatch after a
 * Node upgrade, or a ConPTY teardown that crashes the host process. The build
 * and the other contract tests can't see that (it's a runtime/native issue),
 * so this test exercises the real module: load it, spawn a shell, and kill it
 * cleanly — using the same `useConptyDll` flag the terminal server uses on
 * Windows to avoid the crashing console-list fork.
 */
import * as pty from 'node-pty';

const SHELL = process.platform === 'win32'
  ? (process.env.ComSpec || 'cmd.exe')
  : (process.env.SHELL || '/bin/sh');

test('node-pty loads and exposes spawn()', () => {
  expect(typeof pty.spawn).toBe('function');
});

test('node-pty can spawn a shell and kill it without crashing', async () => {
  const proc = pty.spawn(SHELL, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    useConptyDll: process.platform === 'win32',
  });

  expect(typeof proc.pid).toBe('number');

  const exited = new Promise((resolve) => proc.onExit(() => resolve(true)));
  // Let the shell start up.
  await new Promise((r) => setTimeout(r, 500));
  proc.kill();

  const didExit = await Promise.race([
    exited,
    new Promise((r) => setTimeout(() => r(false), 5000)),
  ]);
  expect(didExit).toBe(true);
}, 15000);

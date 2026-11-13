/**
 * An agent that asks a Grok window on the board starts a real console task.
 * That launch must not turn approvals off. A person who starts Grok themselves
 * still gets the headless auto-approve flag.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { jest } from '@jest/globals';
import { CliTaskManager } from '../server/cli-agents/taskManager.js';

const board = [
  { id: 'w-cli', kind: 'agentConsole', cli: 'grok', folder: '/repo', x: 0, y: 0, w: 400, h: 300 },
];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cli-approval-'));

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdin.write = () => true;
  child.stdin.end = () => {};
  child.pid = 4242;
  child.kill = () => {};
  return child;
}

const spawn = jest.fn(() => fakeChild());
const manager = new CliTaskManager({
  spawn,
  env: { PATH: process.env.PATH || '', HOME: tmp, CENSAI_CLI_AGENT_DATA: tmp, CENSAI_CLI_AGENT_HOME: tmp },
  resolveLaunch: () => ({ command: 'grok', prefixArgs: [], source: 'test' }),
  resolveKey: async () => null,
  mayUseServerKeys: async () => false,
  install: async () => { throw new Error('no installs in tests'); },
  wt: {
    resolveRepo: async () => ({ repoRoot: '/repo', head: 'abc123', subdir: '' }),
    createWorktree: async () => {
      const dir = path.join(tmp, 'wt');
      fs.mkdirSync(dir, { recursive: true });
      return { dir, branch: 'hb/agent-ask' };
    },
  },
});

jest.unstable_mockModule('../server/collab/liveDoc.js', () => ({
  openCanvasDocReader: async () => ({ doc: {}, close: async () => {} }),
  transactCanvasDoc: async () => false,
}));
jest.unstable_mockModule('../server/agent-registry/helpCards.js', () => ({
  readDocWindows: () => board,
  placeHelpCard: async (_ws, input) => ({ id: input.id }),
  settleHelpCard: async () => true,
  patchHelpCard: async () => true,
  readHelpCard: async () => null,
}));
jest.unstable_mockModule('../server/cli-agents/index.js', () => ({ getCliTaskManager: () => manager }));
jest.unstable_mockModule('../server/cli-agents/folders.js', () => ({
  allowedRoots: async () => [{ path: '/repo', current: true }],
  assertAllowedFolder: async (folder) => folder,
}));
jest.unstable_mockModule('../server/security/systemAdmin.js', () => ({
  OWNER_ONLY_MESSAGE: 'Only the owner can do this.',
  OWNER_UNCHECKED_MESSAGE: 'Could not check the owner.',
  userRole: async () => 'admin',
  assertSystemAdmin: async () => ({ userId: 7, role: 'admin' }),
  isComputerOwner: async () => true,
  requireSystemAdmin: (_req, _res, next) => next(),
  requireSystemAdminForChanges: (_req, _res, next) => next(),
}));

const { requestBoardHelp } = await import('../server/agent-registry/boardHelp.js');

const scope = { workspaceId: 'ws-a', userId: 7 };

function launchedArgs() {
  const call = spawn.mock.calls.at(-1);
  return call ? call[1] : [];
}

async function untilSpawn(before) {
  for (let i = 0; i < 30 && spawn.mock.calls.length === before; i += 1) {
    await new Promise((resolve) => { setImmediate(resolve); });
  }
}

afterEach(() => {
  for (const task of manager.tasks.values()) task.status = 'done';
  spawn.mockClear();
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('an agent asking the Grok window does not launch it with approvals off', async () => {
  const before = spawn.mock.calls.length;
  await requestBoardHelp(scope, {
    cardId: 'window:w-cli', task: 'Add a file, then run the tests', fromWindowId: 'w-atlas', fromLabel: 'Atlas',
  });
  await untilSpawn(before);
  const args = launchedArgs();
  expect(args.join(' ')).not.toMatch(/always-approve|yolo|bypassPermissions/);
  expect(args).toEqual(expect.arrayContaining(['--permission-mode', 'dontAsk']));
  const task = [...manager.tasks.values()].at(-1);
  expect(task.approvalGated).toBe(true);
  expect(task.gate).toBe('asks');
  expect(task.items.some((item) => item.kind === 'note' && /cannot turn approvals off/.test(item.text))).toBe(true);

  task.status = 'done';
  const followUps = spawn.mock.calls.length;
  await manager.followUp(task.id, { prompt: 'Now change another file', user: { userId: 7, name: 'Atlas' } });
  await untilSpawn(followUps);
  expect(launchedArgs().join(' ')).not.toMatch(/always-approve|yolo|bypassPermissions/);
  expect(launchedArgs()).toEqual(expect.arrayContaining(['--permission-mode', 'dontAsk']));
});

test('a person starting Grok from the console still auto-approves inside the worktree', async () => {
  const before = spawn.mock.calls.length;
  await manager.start({ cli: 'grok', folder: '/repo', prompt: 'Format the notes', user: { name: 'Ada' } });
  await untilSpawn(before);
  expect(launchedArgs()).toContain('--always-approve');
  expect(launchedArgs()).not.toContain('dontAsk');
});

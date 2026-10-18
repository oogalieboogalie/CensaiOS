import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';
import { agentTurnStarted, busyAgents, resetBusyAgents } from '../server/appUpdate/busy.js';
import { repoSlug, workInFlight } from '../server/appUpdate/inFlight.js';
import { cancelPendingRestart, pendingRestart, restartWhenIdle } from '../server/appUpdate/whenIdle.js';
import { describeWork, lookedSince, panelStage, readWait, saveWait, stillOpen } from '../src/lib/appUpdate/trayFlow.js';

const noOthers = async () => [];
const lookup = async (id) => ({ name: id === 'atlas' ? 'Atlas' : 'Nexus' });

afterEach(() => { resetBusyAgents(); cancelPendingRestart(); });

describe('agents mid-task', () => {
  test('a turn counts while it runs and is gone when it ends', async () => {
    const done = agentTurnStarted({ agentId: 'atlas', origin: 'chat' });
    agentTurnStarted({ agentId: 'atlas', origin: 'help' });
    const wf = agentTurnStarted({ agentId: 'nexus', origin: 'workflow' });
    expect(await busyAgents({ lookup, others: noOthers })).toEqual([{ name: 'Atlas', what: 'answering in chat' }]);
    done(); wf();
    expect(await busyAgents({ lookup, others: noOthers })).toEqual([{ name: 'Atlas', what: 'working (help)' }]);
  });
});

describe('work in flight', () => {
  test('lists open, non-draft changes and busy agents', async () => {
    const listPulls = async () => [{ number: 7, title: 'Tray update', draft: false }, { number: 8, title: 'Draft', draft: true }];
    const res = await workInFlight({ slug: { owner: 'o', repo: 'r' }, listPulls, agents: async () => [{ name: 'Atlas', what: 'x' }] });
    expect(res).toEqual({ changes: [{ number: 7, title: 'Tray update' }], agents: [{ name: 'Atlas', what: 'x' }], github: 'ok' });
  });

  test('no GitHub key still answers', async () => {
    const res = await workInFlight({ slug: { owner: 'o', repo: 'r' }, listPulls: async () => { throw new Error('GITHUB_TOKEN not found'); }, agents: noOthers });
    expect(res).toEqual({ changes: [], agents: [], github: 'unavailable' });
  });

  test('reads owner/repo from the origin remote', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slug-'));
    fs.mkdirSync(path.join(root, '.git'));
    fs.writeFileSync(path.join(root, '.git', 'config'), '[core]\n\tbare = false\n[remote "origin"]\n\turl = https://github.com/oogalieboogalie/Homebase.git\n');
    expect(repoSlug(root)).toEqual({ owner: 'oogalieboogalie', repo: 'Homebase' });
    expect(repoSlug(null)).toBeNull();
  });
});

describe('restart once agents finish', () => {
  test('restarts right away when nobody is working', async () => {
    const restart = jest.fn(() => ({ requested: true }));
    expect(await restartWhenIdle({ dir: '/x', busy: noOthers, restart, check: () => {} })).toEqual({ requested: true });
    expect(restart).toHaveBeenCalledTimes(1);
  });

  test('waits for a busy agent, then restarts', async () => {
    let busy = [{ name: 'Atlas', what: 'answering in chat' }];
    const restart = jest.fn(() => ({ requested: true }));
    const res = await restartWhenIdle({ dir: '/x', busy: async () => busy, restart, check: () => {}, every: 5 });
    expect(res).toMatchObject({ requested: false, waiting: true });
    expect(pendingRestart().waiting).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(restart).not.toHaveBeenCalled();
    busy = [];
    await new Promise((r) => setTimeout(r, 30));
    expect(restart).toHaveBeenCalledTimes(1);
    expect(pendingRestart().waiting).toBe(false);
  });

  test('refuses up front when no update can go in', async () => {
    const check = () => { throw Object.assign(new Error('There is no update waiting.'), { statusCode: 409 }); };
    await expect(restartWhenIdle({ dir: '/x', busy: async () => [{ name: 'A' }], check })).rejects.toThrow('no update waiting');
  });
});

describe('tray panel wording', () => {
  test('names the changes and the agents', () => {
    const w = describeWork({ changes: [{ number: 1, title: 'a' }, { number: 2, title: 'b' }], agents: [{ name: 'Atlas' }, { name: 'Atlas' }] });
    expect(w.changeLine).toBe('2 changes are still being finished by the crew.');
    expect(w.agentLine).toBe('Atlas is in the middle of a task. The update waits for it to finish first.');
    expect(describeWork(null)).toMatchObject({ changeLine: '', agentLine: '' });
  });

  test('stages follow what the updater found', () => {
    const asked = '2026-10-17T23:00:00Z';
    expect(panelStage({ checked: { at: '2026-10-17T22:00:00Z' } }, asked)).toBe('checking');
    expect(panelStage({ checking: true, checked: { at: '2026-10-17T23:00:01Z' } }, asked)).toBe('checking');
    expect(panelStage({ checked: { at: '2026-10-17T23:00:01Z', result: 'build-failed' } }, asked)).toBe('build-failed');
    expect(panelStage({ ready: { commit: 'b' }, checked: { at: '2026-10-17T23:00:01Z' } }, asked)).toBe('ready');
    expect(panelStage({ checked: { at: '2026-10-17T23:00:01Z', result: 'up-to-date' } }, asked)).toBe('up-to-date');
    expect(lookedSince({}, null)).toBe(true);
  });

  test('waiting remembers which changes and sees when they land', () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    saveWait({ numbers: [5, 6], since: 'now' }, storage);
    const wait = readWait(storage);
    expect(stillOpen(wait, { changes: [{ number: 6 }, { number: 9 }] })).toEqual([6]);
    expect(stillOpen(wait, { changes: [] })).toEqual([]);
    saveWait(null, storage);
    expect(readWait(storage)).toBeNull();
  });
});

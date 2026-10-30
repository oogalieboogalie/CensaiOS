import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

// A coding agent's task: anyone on the board may open the files it changed
// and see what changed, but a file that holds keys opens only for this
// computer's owner (Pat Example; Sam Example is a teammate), what changed in
// it is never shown, and a link never leads out of the task's worktree. All
// files and words are made up.
const PEOPLE = { 1: { role: 'admin' }, 2: { role: 'user' } };
const pool = { query: jest.fn(async (_sql, [id]) => ({ rows: PEOPLE[id] ? [PEOPLE[id]] : [] })) };
jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'censai-worktree-file-')));
const worktree = path.join(root, 'made-up-task');
fs.mkdirSync(worktree);
fs.writeFileSync(path.join(worktree, 'notes.md'), 'Made-up note');
fs.writeFileSync(path.join(worktree, '.env'), 'MADE_UP_KEY=not-a-real-made-up-key');
fs.writeFileSync(path.join(root, 'outside.md'), 'Made-up words outside');
fs.symlinkSync(path.join(worktree, '.env'), path.join(worktree, 'made-up-link.md'));
fs.symlinkSync(path.join(root, 'outside.md'), path.join(worktree, 'made-up-outside.md'));
fs.mkdirSync(path.join(worktree, '.made-up'));
fs.writeFileSync(path.join(worktree, '.made-up', 'notes.md'), 'Made-up hidden note');
fs.symlinkSync(path.join(worktree, '.made-up', 'notes.md'), path.join(worktree, 'made-up-hidden-link.md'));
fs.mkdirSync(path.join(worktree, '.github'));
fs.writeFileSync(path.join(worktree, '.github', 'made-up.yml'), 'name: Made-up check');

// A made-up repo whose task changed an ordinary file and added or renamed files that hold keys.
const repo = path.join(root, 'made-up-repo');
fs.mkdirSync(repo);
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
git('init', '-q');
git('config', 'user.email', 'pat@example.invalid');
git('config', 'user.name', 'Pat Example');
// Settings that drop or change the a/ b/ before each name still leave every file's keys out.
git('config', 'diff.noprefix', 'true');
git('config', 'diff.mnemonicPrefix', 'true');
fs.writeFileSync(path.join(repo, 'notes.md'), 'Made-up note\n');
fs.writeFileSync(path.join(repo, 'old-name.md'), 'MADE_UP_KEY=old-made-up-key\nline two\nline three\n');
fs.mkdirSync(path.join(repo, '.made-up'));
fs.writeFileSync(path.join(repo, '.made-up', 'settings.json'), '{}\n');
git('add', '.');
git('commit', '-qm', 'made-up start');
const baseSha = git('rev-parse', 'HEAD').trim();
fs.writeFileSync(path.join(repo, 'notes.md'), 'Made-up note, changed\n');
fs.writeFileSync(path.join(repo, '.env'), 'MADE_UP_KEY=not-a-real-made-up-key\n');
fs.mkdirSync(path.join(repo, 'made up'));
fs.writeFileSync(path.join(repo, 'made up', '.env.local'), 'MADE_UP_KEY=not-a-real-made-up-key-2\n');
fs.writeFileSync(path.join(repo, '.made-up', 'settings.json'), '{ "token": "made-up-hidden-token" }\n');
git('mv', 'old-name.md', 'made-up.pem');
fs.appendFileSync(path.join(repo, 'made-up.pem'), 'not-a-real-made-up-key-3\n');

const { changes, readWorktreeFile } = await import('../server/cli-agents/worktrees.js');
const { CliTaskManager } = await import('../server/cli-agents/taskManager.js');
const { diffWithoutSecrets } = await import('../server/security/secretFiles.js');
const { FILE_PROBLEMS, SECRET_CHANGES } = await import('../shared/files/fileProblems.js');
const { parsePatch } = await import('../src/components/agentConsole/lineDiff.js');

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

/** The error `read` throws, or null. */
function refusal(read) {
  try {
    read();
    return null;
  } catch (err) {
    return { statusCode: err.statusCode, message: err.message };
  }
}

describe('a file in a coding agent\'s worktree', () => {
  test('an ordinary file opens for anyone', () => {
    expect(readWorktreeFile(worktree, 'notes.md')).toEqual({ content: 'Made-up note', secret: false });
  });

  test('a file that holds keys, asked for by name or through a link, there or not, opens only for the owner', () => {
    for (const rel of ['.env', 'made-up-link.md', '.env.local']) {
      expect(refusal(() => readWorktreeFile(worktree, rel))).toEqual({ statusCode: 403, message: FILE_PROBLEMS.ownerOnly });
    }
    for (const rel of ['.env', 'made-up-link.md']) {
      const read = readWorktreeFile(worktree, rel, { secrets: true });
      expect(read.content).toContain('MADE_UP_KEY');
      expect(read.secret).toBe(true);
    }
  });

  test('a file in a hidden folder, asked for there or through a link, opens only for the owner; .github is shared', () => {
    for (const rel of [path.join('.made-up', 'notes.md'), 'made-up-hidden-link.md']) {
      expect(refusal(() => readWorktreeFile(worktree, rel))).toEqual({ statusCode: 403, message: FILE_PROBLEMS.ownerOnly });
      expect(readWorktreeFile(worktree, rel, { secrets: true })).toEqual({ content: 'Made-up hidden note', secret: true });
    }
    expect(readWorktreeFile(worktree, path.join('.github', 'made-up.yml'))).toEqual({ content: 'name: Made-up check', secret: false });
  });

  test('a link out of the worktree is refused, even for the owner', () => {
    expect(refusal(() => readWorktreeFile(worktree, 'made-up-outside.md', { secrets: true }))?.statusCode).toBe(400);
    expect(refusal(() => readWorktreeFile(worktree, '../outside.md', { secrets: true }))?.statusCode).toBe(400);
  });
});

describe("a coding agent's changes", () => {
  test('show what changed in an ordinary file, and only that a file that holds keys changed', async () => {
    const { patch } = await changes({ dir: repo, baseSha });
    // A hand-off still applies the whole diff, keys and all, in the next task's worktree.
    expect(patch).toContain('not-a-real-made-up-key-2');
    const shown = diffWithoutSecrets(patch);
    expect(shown).not.toContain('not-a-real');
    expect(shown).not.toContain('old-made-up-key');
    const files = parsePatch(shown);
    expect(files.find((f) => f.path === 'notes.md')).toMatchObject({ secret: false, hunks: [expect.anything()] });
    for (const p of ['.env', 'made up/.env.local', 'made-up.pem']) {
      expect(files.find((f) => f.path === p)).toMatchObject({ secret: true, hunks: [] });
    }
    expect(shown.split(SECRET_CHANGES).length - 1).toBe(3);
  });

  test('a file in a hidden folder shows what changed for the owner, and only that it changed for a teammate', async () => {
    const { patch } = await changes({ dir: repo, baseSha });
    expect(diffWithoutSecrets(patch)).toContain('made-up-hidden-token');
    const shown = diffWithoutSecrets(patch, { hidden: true });
    expect(shown).not.toContain('made-up-hidden-token');
    expect(shown).not.toContain('not-a-real');
    expect(parsePatch(shown).find((f) => f.path === '.made-up/settings.json')).toMatchObject({ secret: true, hunks: [] });
    expect(parsePatch(shown).find((f) => f.path === 'notes.md')).toMatchObject({ secret: false });
  });

  test('a rename git had to quote is judged by its names without the quotes', () => {
    const quoted = [
      'diff --git "a/na\\303\\257ve/old.md" "b/na\\303\\257ve/.env"',
      'similarity index 80%',
      'rename from "na\\303\\257ve/old.md"',
      'rename to "na\\303\\257ve/.env"',
      '@@ -1 +1 @@',
      '-made-up line',
      '+MADE_UP_KEY=not-a-real-made-up-key',
      '',
    ].join('\n');
    const shown = diffWithoutSecrets(quoted);
    expect(shown).toContain(SECRET_CHANGES);
    expect(shown).not.toContain('not-a-real');
  });

  test('an empty or ordinary diff passes through as it is', () => {
    expect(diffWithoutSecrets('')).toBe('');
    expect(diffWithoutSecrets(undefined)).toBe('');
    const ordinary = 'diff --git a/notes.md b/notes.md\n--- a/notes.md\n+++ b/notes.md\n@@ -1 +1 @@\n-a\n+b\n';
    expect(diffWithoutSecrets(ordinary)).toBe(ordinary);
  });
});

describe('GET /api/cli-agents/tasks/:id/file and /changes', () => {
  const tasks = {
    'made-up-task': { id: 'made-up-task', worktree: { dir: worktree } },
    'made-up-repo-task': { id: 'made-up-repo-task', worktree: { dir: repo }, baseSha },
  };
  const manager = Object.assign(Object.create(CliTaskManager.prototype), {
    get: (id) => tasks[id],
    wt: { readWorktreeFile, changes },
  });
  jest.unstable_mockModule('../server/cli-agents/index.js', () => ({
    getCliTaskManager: () => manager,
    cliRoster: () => [],
    forgetVersions: () => {},
  }));
  let cliAgentsRouter;
  beforeAll(async () => { ({ cliAgentsRouter } = await import('../server/routes/cliAgents.js')); });

  function app(userId) {
    const a = express();
    a.use((req, _res, next) => { req.session = { userId }; next(); });
    a.use('/api/cli-agents', cliAgentsRouter);
    return a;
  }
  const open = (who, rel) => request(app(who)).get('/api/cli-agents/tasks/made-up-task/file').query({ path: rel });

  test('Sam, a teammate, opens an ordinary file but gets plain words for a file that holds keys', async () => {
    expect((await open(2, 'notes.md').expect(200)).body).toEqual({ path: 'notes.md', content: 'Made-up note' });
    const res = await open(2, '.env').expect(403);
    expect(res.body).toEqual({ error: FILE_PROBLEMS.ownerOnly, reason: 'ownerOnly' });
    expect(res.text).not.toContain('not-a-real');
  });

  test('Pat, the owner, opens it, told its words are for Pat alone', async () => {
    const res = await open(1, '.env').expect(200);
    expect(res.body.content).toContain('MADE_UP_KEY');
    expect(res.body.ownerOnly).toBe(true);
    expect((await open(1, 'notes.md').expect(200)).body.ownerOnly).toBeUndefined();
  });

  test('what changed shows no file\'s keys to anyone, and still lists every changed file', async () => {
    for (const who of [1, 2]) {
      const res = await request(app(who)).get('/api/cli-agents/tasks/made-up-repo-task/changes').expect(200);
      expect(res.text).not.toContain('not-a-real');
      expect(res.body.patch).toContain('+Made-up note, changed');
      expect(res.body.files.map((f) => f.path).sort()).toEqual(['.env', '.made-up/settings.json', 'made up/.env.local', 'notes.md', 'old-name.md => made-up.pem']);
    }
  });

  test("what changed in a hidden folder shows for Pat, and not for Sam, nor in what Pat hands to a chat on the board", async () => {
    const changed = async (who, query = {}) => (await request(app(who)).get('/api/cli-agents/tasks/made-up-repo-task/changes').query(query).expect(200)).text;
    expect(await changed(1)).toContain('made-up-hidden-token');
    expect(await changed(2)).not.toContain('made-up-hidden-token');
    const forBoard = await changed(1, { board: '1' });
    expect(forBoard).not.toContain('made-up-hidden-token');
    expect(forBoard).toContain('+Made-up note, changed');
  });
});

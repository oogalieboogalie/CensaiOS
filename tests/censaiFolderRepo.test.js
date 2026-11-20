// Which GitHub repo a project folder here is a checkout of (server/censaiOrchestrator/folderRepo.js).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { folderRepos, remotesIn, repoKey } from '../server/censaiOrchestrator/folderRepo.js';

const tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'censai-folder-repo-')));
afterAll(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

describe('naming a repo', () => {
  test.each([
    ['made-up/Homebase', 'made-up/homebase'],
    ['https://github.com/Made-Up/Homebase.git', 'made-up/homebase'],
    ['git@github.com:made-up/homebase.git', 'made-up/homebase'],
    ['ssh://git@github.com/made-up/homebase/', 'made-up/homebase'],
    ['https://made-up-token@github.com/made-up/homebase.git', 'made-up/homebase'],
    ['https://example.com/github.com/made-up/homebase', null],
    ['Homebase', null],
    ['', null],
  ])('%s is %s', (value, key) => expect(repoKey(value)).toBe(key));

  test('a quoted address and an upper-case key are read too', () => {
    expect([...remotesIn('[remote "origin"]\n\tURL = "https://github.com/made-up/homebase.git"\n')]).toEqual(['made-up/homebase']);
  });

  test('only GitHub remotes count', () => {
    const text = '[remote "origin"]\n\turl = https://github.com/made-up/homebase\n[remote "forge"]\n\turl = https://forge.example.com/made-up/homebase\n';
    expect([...remotesIn(text)]).toEqual(['made-up/homebase']);
  });
});

describe('reading a folder', () => {
  test('a checkout, and a worktree of it, both name the repo', async () => {
    const main = path.join(tempRoot, 'MadeUpMain');
    fs.mkdirSync(path.join(main, '.git', 'worktrees', 'side'), { recursive: true });
    fs.writeFileSync(path.join(main, '.git', 'config'), '[remote "origin"]\n\turl = git@github.com:made-up/homebase.git\n');
    fs.writeFileSync(path.join(main, '.git', 'worktrees', 'side', 'commondir'), '../..\n');
    const side = path.join(tempRoot, 'MadeUpSide');
    fs.mkdirSync(side);
    fs.writeFileSync(path.join(side, '.git'), `gitdir: ${path.join(main, '.git', 'worktrees', 'side')}\n`);
    expect([...await folderRepos(main)]).toEqual(['made-up/homebase']);
    expect([...await folderRepos(side)]).toEqual(['made-up/homebase']);
  });

  test('a folder with no git settings, or none at all, names nothing', async () => {
    const plain = path.join(tempRoot, 'MadeUpPlain');
    fs.mkdirSync(plain);
    expect((await folderRepos(plain)).size).toBe(0);
    expect((await folderRepos(path.join(tempRoot, 'not-there'))).size).toBe(0);
    expect((await folderRepos('')).size).toBe(0);
  });
});

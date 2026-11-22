// censaiOS in Docker runs as root in a code folder that belongs to the person.
// Files git makes there as root stopped the owner's updater from downloading.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { handBackGitFiles } from '../server/cli-agents/gitOwnership.js';

function repoWith(files) {
  const gitDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'censai-owner-')), '.git');
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(gitDir, file)), { recursive: true });
    fs.writeFileSync(path.join(gitDir, file), '');
  }
  return gitDir;
}

/** A disk where the repo is the person's (uid 1000) and the named paths were made by root. */
function disk(gitDir, rootMade) {
  const handed = [];
  const io = {
    readdirSync: fs.readdirSync,
    lstatSync: (full) => {
      const st = fs.lstatSync(full);
      const rel = path.relative(gitDir, full).split(path.sep).join('/');
      const byRoot = rootMade.includes(rel) && !handed.some((h) => h.full === full);
      return { isDirectory: () => st.isDirectory(), uid: byRoot ? 0 : 1000, gid: byRoot ? 0 : 1000 };
    },
    lchownSync: (full, uid, gid) => handed.push({ full, rel: path.relative(gitDir, full).split(path.sep).join('/'), uid, gid }),
  };
  return { io, handed };
}

describe('files git made as root go back to the folder\'s owner', () => {
  const files = ['objects/e6/9de29bb2', 'objects/ab/cdef', 'refs/heads/censai/claudecode-1', 'worktrees/t1/HEAD', 'HEAD'];
  const rootMade = ['objects/e6', 'objects/e6/9de29bb2', 'refs/heads/censai', 'refs/heads/censai/claudecode-1', 'worktrees', 'worktrees/t1', 'worktrees/t1/HEAD'];

  test('every root-made file and folder is handed to the owner, and nothing else is touched', () => {
    const gitDir = repoWith(files);
    const { io, handed } = disk(gitDir, rootMade);

    expect(handBackGitFiles(gitDir, { uid: 0, io })).toBe(rootMade.length);
    expect(handed.map((h) => h.rel).sort()).toEqual([...rootMade].sort());
    expect(handed.every((h) => h.uid === 1000 && h.gid === 1000)).toBe(true);
    // A second pass finds nothing left.
    expect(handBackGitFiles(gitDir, { uid: 0, io })).toBe(0);
  });

  test('censaiOS that does not run as root changes nothing', () => {
    const gitDir = repoWith(files);
    const { io, handed } = disk(gitDir, rootMade);
    expect(handBackGitFiles(gitDir, { uid: 1000, io })).toBe(0);
    expect(handBackGitFiles(gitDir, { uid: undefined, io })).toBe(0);
    expect(handed).toEqual([]);
  });

  test('a repo that is root\'s own is left alone', () => {
    const gitDir = repoWith(files);
    const io = { readdirSync: fs.readdirSync, lstatSync: () => ({ isDirectory: () => true, uid: 0, gid: 0 }), lchownSync: () => { throw new Error('touched'); } };
    expect(handBackGitFiles(gitDir, { uid: 0, io })).toBe(0);
  });

  test('a folder that is not there, or a file that cannot be changed, never throws', () => {
    expect(handBackGitFiles(path.join(os.tmpdir(), 'censai-no-such-repo', '.git'), { uid: 0 })).toBe(0);
    const gitDir = repoWith(files);
    const { io } = disk(gitDir, rootMade);
    io.lchownSync = () => { throw new Error('EPERM'); };
    expect(handBackGitFiles(gitDir, { uid: 0, io })).toBe(0);
  });
});

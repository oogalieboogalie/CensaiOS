// censaiOS in Docker runs as root, and a person's code folder is mounted in
// from their computer. Every file git makes there as root is one the person's
// own account cannot write under afterwards: a root-owned folder in
// .git/objects made "git fetch" fail on the owner's computer, and its updater
// could not download anything. After git has written in someone's repo, this
// hands those files back to whoever owns the repo.
import fs from 'fs';
import path from 'path';

const MAX_ENTRIES = 200_000;

/**
 * Give every file under `gitDir` that this process made as root back to the
 * folder's owner. Does nothing unless this process is root and the folder is
 * someone else's. Returns how many files changed hands. Never throws.
 */
export function handBackGitFiles(gitDir, { uid = process.getuid?.(), io = fs } = {}) {
  if (uid !== 0 || !gitDir) return 0;
  let owner;
  try { owner = io.lstatSync(gitDir); } catch { return 0; /* quiet: no such folder, nothing to hand back */ }
  if (!owner.isDirectory() || owner.uid === 0) return 0;
  let handed = 0;
  let seen = 0;
  const stack = [gitDir];
  while (stack.length && seen < MAX_ENTRIES) {
    const dir = stack.pop();
    let names;
    try { names = io.readdirSync(dir); } catch { continue; /* quiet: a folder that went away mid-walk */ }
    for (const name of names) {
      const full = path.join(dir, name);
      let st;
      try { st = io.lstatSync(full); } catch { continue; /* quiet: a file that went away mid-walk */ }
      seen += 1;
      if (st.uid === 0) {
        try { io.lchownSync(full, owner.uid, owner.gid); handed += 1; } catch { /* quiet: a file that cannot change hands is left as it was, the rest still do */ }
      }
      if (st.isDirectory()) stack.push(full);
    }
  }
  return handed;
}

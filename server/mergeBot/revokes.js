// Revokes the merge bot has already seen. Deleting the comment does not remove them.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalRepo } from './signature.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function insideRepo(target, root) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

function isStateDir(target, root) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === '.homebase-state' || rel.startsWith(`.homebase-state${path.sep}`);
}

function unavailable() {
  const err = new Error('revokes');
  err.code = 'revokes-unavailable';
  return err;
}

// The gitignored state folder is allowed when it is asked for by name: Docker
// keeps that folder on a volume. Anywhere else inside the checkout is refused.
// There is no temporary-folder fallback.
export function revokeStateFile({
  file,
  env = process.env,
  home = os.homedir(),
  root = repoRoot,
} = {}) {
  if (file) return path.resolve(file);
  const chosen = env.CENSAI_STATE_DIR ? path.resolve(env.CENSAI_STATE_DIR) : '';
  if (chosen) {
    if (!insideRepo(chosen, root) || isStateDir(chosen, root)) return path.join(chosen, 'merge-bot', 'revokes.json');
    throw unavailable();
  }
  const base = env.XDG_DATA_HOME ? path.resolve(env.XDG_DATA_HOME) : path.join(home, '.local', 'share');
  const dir = path.join(base, 'censai', 'merge-bot');
  if (insideRepo(dir, root)) throw unavailable();
  return path.join(dir, 'revokes.json');
}

function broken() {
  const err = new Error('revokes');
  err.code = 'revokes-unreadable';
  return err;
}

export function createRevokeStore({ file, env, home, root } = {}) {
  const target = revokeStateFile({ file, env, home, root });
  let items = [];
  let unreadable = false;

  function load() {
    unreadable = false;
    if (!fs.existsSync(target)) {
      items = [];
      return;
    }
    try {
      const saved = JSON.parse(fs.readFileSync(target, 'utf8'));
      items = Array.isArray(saved.items) ? saved.items : [];
    } catch {
      unreadable = true;
      items = [];
    }
  }

  function save() {
    const dir = path.dirname(target);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, items }, null, 1), { mode: 0o600 });
    fs.renameSync(tmp, target);
  }

  load();

  return {
    forPull(repo, number) {
      if (unreadable) throw broken();
      const wantRepo = canonicalRepo(repo);
      const wantPr = Number(number);
      return items
        .filter((item) => canonicalRepo(item.repo) === wantRepo && Number(item.number) === wantPr)
        .map((item) => String(item.sha).toLowerCase());
    },
    remember(repo, number, shas) {
      if (unreadable) throw broken();
      const wantRepo = canonicalRepo(repo);
      const wantPr = Number(number);
      let added = false;
      for (const raw of shas || []) {
        const sha = String(raw || '').trim().toLowerCase();
        if (!/^[0-9a-f]{40}$/.test(sha)) continue;
        const known = items.some((item) => canonicalRepo(item.repo) === wantRepo && Number(item.number) === wantPr && item.sha === sha);
        if (known) continue;
        items.push({ repo: wantRepo, number: wantPr, sha });
        added = true;
      }
      if (added) save();
    },
  };
}

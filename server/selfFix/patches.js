import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';

/**
 * Self-fix patch queue, kept inside censaiOS's own folder so the launcher can
 * see it too (scripts/self-fix-patches.ps1 does the same steps on Windows):
 *
 *   .homebase-state/self-fix/patches/pending/<id>.patch   checked, waiting for a restart
 *   .homebase-state/self-fix/patches/applied/<id>.patch   in the code now (Undo reverses it)
 *   .homebase-state/self-fix/patches/landed/<id>.patch    the same fix arrived with an update
 *   .homebase-state/self-fix/patches/undone/<id>.patch    someone pressed Undo
 *
 * A fix is never committed and never pushed: it is an uncommitted change in
 * the person's own copy, and the saved .patch is what the crew lands upstream.
 */

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STATES = ['pending', 'applied', 'landed', 'undone'];
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

function git(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(new Error(String(stderr || err.message).trim().split('\n').slice(-2).join(' ')), { code: err.code }));
      else resolve(String(stdout));
    });
  });
}

/**
 * The copy of censaiOS a fix goes into. In Docker the app runs from the
 * image, and its source folder is mounted at HOMEBASE_CONTAINER_PROJECT_ROOT.
 * Returns null when there is no git copy (the laptop app): reports only.
 */
export function selfRepo(env = process.env) {
  const candidates = [env.CENSAI_SELF_FIX_REPO, env.HOMEBASE_CONTAINER_PROJECT_ROOT, APP_ROOT].filter(Boolean);
  for (const dir of candidates) {
    const resolved = path.resolve(dir);
    if (fs.existsSync(path.join(resolved, '.git')) && fs.existsSync(path.join(resolved, 'server', 'selfFix'))) return resolved;
  }
  return null;
}

export function queueDir(repoRoot) {
  return path.join(repoRoot, '.homebase-state', 'self-fix', 'patches');
}

function fileFor(repoRoot, state, id) {
  if (!SAFE_ID.test(String(id))) throw Object.assign(new Error('Bad fix id.'), { statusCode: 400 });
  const root = path.resolve(queueDir(repoRoot));
  const file = path.resolve(root, state, `${id}.patch`);
  if (!STATES.includes(state) || !file.startsWith(root + path.sep)) {
    throw Object.assign(new Error('Bad fix id.'), { statusCode: 400 });
  }
  return file;
}

function move(repoRoot, id, from, to) {
  const target = fileFor(repoRoot, to, id);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(fileFor(repoRoot, from, id), target);
}

/** Where a fix's patch is now: 'pending' | 'applied' | 'landed' | 'undone' | null. */
export function patchState(repoRoot, id) {
  if (!repoRoot) return null;
  return STATES.find((state) => fs.existsSync(fileFor(repoRoot, state, id))) || null;
}

export function readPatch(repoRoot, id) {
  const state = patchState(repoRoot, id);
  return state ? fs.readFileSync(fileFor(repoRoot, state, id), 'utf8') : null;
}

export function queuePatch(repoRoot, id, patch) {
  const file = fileFor(repoRoot, 'pending', id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, patch.endsWith('\n') ? patch : `${patch}\n`);
  return file;
}

/** In Docker the image must be rebuilt to pick up a source change; the launcher looks for this. */
export function markRebuild(repoRoot, env = process.env) {
  if (!env.CENSAI_IN_CONTAINER) return;
  try {
    const marker = path.join(repoRoot, '.homebase-state', 'self-fix', 'rebuild-needed');
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, new Date().toISOString());
  } catch { /* the launcher will still apply pending fixes */ }
}

/**
 * Put every waiting fix into the code. A fix that no longer applies but is
 * already there (an update brought it) moves to landed; one that conflicts
 * stays pending and is reported.
 */
export async function applyPending(repoRoot, env = process.env) {
  const dir = path.join(queueDir(repoRoot), 'pending');
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.patch')).sort()) {
    const id = name.replace(/\.patch$/, '');
    const file = path.join(dir, name);
    try {
      // A Windows copy may have CRLF line endings the patch does not; the
      // second try lets the context lines match anyway.
      const flags = await git(['apply', '--check', file], repoRoot).then(() => [],
        () => git(['apply', '--check', '--ignore-whitespace', file], repoRoot).then(() => ['--ignore-whitespace']));
      await git(['apply', ...flags, file], repoRoot);
      move(repoRoot, id, 'pending', 'applied');
      results.push({ id, result: 'applied' });
    } catch (err) {
      const already = await git(['apply', '-R', '--check', file], repoRoot).then(() => true, () => false);
      if (already) {
        move(repoRoot, id, 'pending', 'landed');
        results.push({ id, result: 'landed' });
      } else {
        results.push({ id, result: 'conflict', error: err.message });
      }
    }
  }
  if (results.some((r) => r.result === 'applied')) markRebuild(repoRoot, env);
  return results;
}

/** Undo one fix: take it back out of the code, or drop it before it is applied. */
export async function undoPatch(repoRoot, id, env = process.env) {
  const state = patchState(repoRoot, id);
  if (!state || state === 'undone') return { result: 'nothing' };
  if (state === 'applied') {
    const file = fileFor(repoRoot, 'applied', id);
    try {
      await git(['apply', '-R', '--check', file], repoRoot);
    } catch {
      throw Object.assign(new Error('That fix was changed by later edits, so it cannot be taken out automatically.'), { statusCode: 409 });
    }
    await git(['apply', '-R', file], repoRoot);
    markRebuild(repoRoot, env);
  }
  move(repoRoot, id, state, 'undone');
  return { result: state === 'applied' ? 'reversed' : 'dropped' };
}

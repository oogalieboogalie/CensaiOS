// Censai the orchestrator: which GitHub repos a folder on this computer is a
// checkout of, read from its git settings (no git command, nothing changed).
// planProject.js uses it to find the folder here for a project row that is
// kept on GitHub, so a code job's tests can run where its saves land.

import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveProjectPathForRuntime } from '../workspaces/shared.js';

// The host must be github.com itself: https://, ssh:// or git@ forms, with or without a sign-in part.
const GITHUB = /^(?:[a-z+]+:\/\/)?(?:[^@/\s]+@)?github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;

/** "owner/repo" in lower case from a repo field or a remote address, or null. */
export function repoKey(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const hosted = GITHUB.exec(text);
  if (hosted) return `${hosted[1]}/${hosted[2]}`.toLowerCase();
  const plain = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(text);
  return plain ? `${plain[1]}/${plain[2]}`.toLowerCase() : null;
}

/**
 * The repo named by the origin remote in a git settings file's text (a set of one, or empty).
 * Only origin: a fork's "upstream" names the original repo, but the folder holds the fork's code.
 */
export function remotesIn(configText, { keepCase = false } = {}) {
  const keys = new Set();
  let inOrigin = false;
  for (const line of String(configText || '').split(/\r?\n/)) {
    const section = /^\s*\[(.+?)\]\s*$/.exec(line)?.[1];
    if (section) {
      inOrigin = /^remote\s+"origin"$/i.test(section.trim());
      continue;
    }
    const url = inOrigin ? /^\s*url\s*=\s*"?(.+?)"?\s*$/i.exec(line)?.[1] : null;
    const hosted = url ? GITHUB.exec(url) : null;
    // keepCase: as the remote spells it ("Alma/ShopApp"), for a lookup that compares the repo exactly.
    const key = hosted ? (keepCase ? `${hosted[1]}/${hosted[2]}` : repoKey(url)) : null;
    if (key) keys.add(key);
  }
  return keys;
}

/** A file's text, or null when it is not there (a folder, or a checkout without that file). */
async function textOrNull(readText, file) {
  try {
    return await readText(file);
  } catch { /* quiet: a missing file is an answer here (no worktree pointer, no commondir) */
    return null;
  }
}

// A worktree's .git is a file that points at its git folder; that folder may point at the main one.
// own: where this checkout's HEAD is. shared: where the settings and the branches are.
async function gitFolders(root, readText) {
  const dotGit = path.join(root, '.git');
  const text = await textOrNull(readText, dotGit);
  const pointer = text === null ? null : /^gitdir:\s*(.+?)\s*$/m.exec(text)?.[1];
  if (!pointer) return { own: dotGit, shared: dotGit };
  // Git writes the pointer as a path on the machine that made it; map it the way project paths are mapped.
  const absolute = path.isAbsolute(pointer) || /^[a-z]:[\\/]/i.test(pointer);
  const own = absolute ? resolveProjectPathForRuntime(pointer) : path.resolve(root, pointer);
  const common = await textOrNull(readText, path.join(own, 'commondir'));
  return { own, shared: common ? path.resolve(own, common.trim()) : own };
}

const readFileText = (file) => fs.readFile(file, 'utf8');

/** The GitHub repos ("owner/repo", lower case) the project folder is a checkout of; empty when none or unreadable. */
export async function folderRepos(projectPath, { readText = readFileText, keepCase = false } = {}) {
  if (!projectPath) return new Set();
  try {
    const root = resolveProjectPathForRuntime(projectPath);
    const config = await readText(path.join((await gitFolders(root, readText)).shared, 'config'));
    return remotesIn(config, { keepCase });
  } catch { /* quiet: no git folder here means no repo to match, which the caller handles */
    return new Set();
  }
}

const COMMIT = /^[0-9a-f]{40,64}$/i;

/**
 * The branch a project folder is on and the commit it is at: { branch, commit }, each null
 * when it is not known (no git here; a folder parked on a bare commit has no branch).
 */
export async function folderHead(projectPath, { readText = readFileText } = {}) {
  if (!projectPath) return { branch: null, commit: null };
  try {
    const { own, shared } = await gitFolders(resolveProjectPathForRuntime(projectPath), readText);
    const head = String(await readText(path.join(own, 'HEAD'))).trim();
    const ref = /^ref:\s*(\S+)$/.exec(head)?.[1];
    if (!ref) return { branch: null, commit: COMMIT.test(head) ? head : null };
    const loose = (await textOrNull(readText, path.join(shared, ref)))?.trim();
    const packed = loose ? null : await textOrNull(readText, path.join(shared, 'packed-refs'));
    const commit = loose || String(packed || '').split(/\r?\n/).find((line) => line.endsWith(` ${ref}`))?.split(' ')[0] || '';
    return { branch: ref.replace(/^refs\/heads\//, ''), commit: COMMIT.test(commit) ? commit : null };
  } catch { /* quiet: no git folder here means no branch to pin, which the caller says */
    return { branch: null, commit: null };
  }
}

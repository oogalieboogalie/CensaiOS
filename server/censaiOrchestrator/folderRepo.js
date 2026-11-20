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

/** The repos named by the remotes in a git settings file's text. */
export function remotesIn(configText) {
  const keys = new Set();
  for (const line of String(configText || '').split(/\r?\n/)) {
    const url = /^\s*url\s*=\s*"?(.+?)"?\s*$/i.exec(line)?.[1];
    const key = url && GITHUB.test(url) ? repoKey(url) : null;
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
async function gitFolder(root, readText) {
  const dotGit = path.join(root, '.git');
  const text = await textOrNull(readText, dotGit);
  const pointer = text === null ? null : /^gitdir:\s*(.+?)\s*$/m.exec(text)?.[1];
  if (!pointer) return dotGit;
  // Git writes the pointer as a path on the machine that made it; map it the way project paths are mapped.
  const absolute = path.isAbsolute(pointer) || /^[a-z]:[\\/]/i.test(pointer);
  const own = absolute ? resolveProjectPathForRuntime(pointer) : path.resolve(root, pointer);
  const common = await textOrNull(readText, path.join(own, 'commondir'));
  return common ? path.resolve(own, common.trim()) : own;
}

/** The GitHub repos ("owner/repo", lower case) the project folder is a checkout of; empty when none or unreadable. */
export async function folderRepos(projectPath, { readText = (file) => fs.readFile(file, 'utf8') } = {}) {
  if (!projectPath) return new Set();
  try {
    const root = resolveProjectPathForRuntime(projectPath);
    const config = await readText(path.join(await gitFolder(root, readText), 'config'));
    return remotesIn(config);
  } catch { /* quiet: no git folder here means no repo to match, which the caller handles */
    return new Set();
  }
}

// Folders a coding CLI may work in: the open projects and folders inside
// them. Shared by the Agent Console route and agents that ask a CLI for help.

import fs from 'fs';
import path from 'path';
import { readOpenProjects, readCurrentProject } from '../routes/projects/shared.js';
import { resolveProjectPathForRuntime } from '../workspaces/shared.js';

/** Folders an agent may work in: the open projects (and folders inside them). */
export async function allowedRoots() {
  const current = await readCurrentProject().catch(() => null);
  const open = await readOpenProjects().catch(() => []);
  const stored = [current?.path, ...open].filter(Boolean);
  const seen = new Set();
  const roots = [];
  for (const p of stored) {
    const runtime = path.resolve(resolveProjectPathForRuntime(p));
    if (seen.has(runtime)) continue;
    seen.add(runtime);
    roots.push({ path: runtime, name: path.basename(runtime), current: p === current?.path, isGit: fs.existsSync(path.join(runtime, '.git')) });
  }
  return roots;
}

export async function assertAllowedFolder(folder) {
  const target = path.resolve(String(folder || ''));
  const roots = await allowedRoots();
  const ok = roots.some((r) => target === r.path || target.startsWith(r.path + path.sep));
  if (!ok) {
    throw Object.assign(new Error('Open that folder as a project first (project picker in the top bar), then pick it here.'), { statusCode: 403 });
  }
  return target;
}

/** The open project a folder is in (the innermost, when one is inside another), or null. */
export async function rootOf(folder) {
  const target = path.resolve(String(folder || ''));
  const roots = (await allowedRoots()).filter((r) => target === r.path || target.startsWith(r.path + path.sep));
  return roots.sort((a, b) => b.path.length - a.path.length)[0]?.path || null;
}

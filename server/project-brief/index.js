import fs from 'fs';
import path from 'path';
import {
  getTree as ghGetTree, tryGetFile as ghTryGetFile, formatGithubTree,
} from '../github.js';
import { mapProjectPathForRuntime } from './runtime.js';
import { 
  loadGitignore, buildLocalTree, detectLocalEntryPoints 
} from './local.js';
import { detectGithubEntryPoints } from './github.js';
import { preserveSummary, format } from './formatter.js';

export async function generateLocalBrief({ project, activity = [], existing = null }) {
  const root = mapProjectPathForRuntime(project.path);
  if (!existing) {
    try { existing = await fs.promises.readFile(path.join(root, '.team', 'PROJECT.md'), 'utf8'); } catch {}
  }
  const gitignore = await loadGitignore(root);
  const treeStr = await buildLocalTree(root, gitignore);
  const entries = await detectLocalEntryPoints(root);
  const summary = project.summary || preserveSummary(existing);
  return format({ project, treeStr, entries, summary, activity, kind: 'local' });
}

export async function generateGithubBrief({ project, activity = [], existing = null }) {
  const repo = project.repo;
  if (!existing) {
    existing = await ghTryGetFile(repo, '.team/PROJECT.md');
  }
  const tree = await ghGetTree(repo);
  const treeStr = formatGithubTree(tree);
  const entries = await detectGithubEntryPoints(repo, tree);
  const summary = project.summary || preserveSummary(existing);
  return format({ project, treeStr, entries, summary, activity, kind: 'github' });
}

export async function generateProjectBrief({ project, activity = [] }) {
  if (project.repo) return generateGithubBrief({ project, activity });
  return generateLocalBrief({ project, activity });
}

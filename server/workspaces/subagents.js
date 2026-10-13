import fs from 'fs';
import path from 'path';
import {
  ensureBranch as ghEnsureBranch,
  openPR as ghOpenPR,
} from '../github.js';
import {
  safeName,
  safeAgentId,
  isGithubProject,
  getAgentWorkspaceDir,
  ensureAgentWorkspace,
} from './shared.js';

export function branchNameFor(subAgent) {
  return `agent/${safeName(subAgent.name)}-${safeAgentId(subAgent.id)}`;
}

export async function ensureSubAgentBranch(project, subAgent) {
  if (!isGithubProject(project)) return null;
  const branch = branchNameFor(subAgent);
  await ghEnsureBranch(project.repo, branch);
  return branch;
}

export async function openSubAgentPR(project, subAgent, { title, body }) {
  if (!isGithubProject(project)) throw new Error('Not a GitHub project');
  if (!subAgent.github_branch) throw new Error('Sub-agent has no branch');
  const pr = await ghOpenPR(project.repo, subAgent.github_branch, title, body);
  return pr;
}

export async function mirrorSubAgentToDisk(parentAgentId, subAgent) {
  try {
    await ensureAgentWorkspace(parentAgentId);
    const subDir = path.join(getAgentWorkspaceDir(parentAgentId), 'sub-agents', safeName(subAgent.workspace_id), safeName(subAgent.name));
    await fs.promises.mkdir(subDir, { recursive: true });
    const config = {
      id: subAgent.id,
      name: subAgent.name,
      parent_id: subAgent.parent_id,
      workspace_id: subAgent.workspace_id,
      role: subAgent.role,
      specialty: subAgent.specialty,
      permission: subAgent.permission,
      project_id: subAgent.project_id,
      github_branch: subAgent.github_branch,
      created_at: subAgent.created_at,
    };
    await fs.promises.writeFile(path.join(subDir, 'config.json'), JSON.stringify(config, null, 2), 'utf8');
    return subDir;
  } catch {
    return null;
  }
}

export async function removeSubAgentFromDisk(parentAgentId, subAgent) {
  try {
    const subDir = path.join(getAgentWorkspaceDir(parentAgentId), 'sub-agents', safeName(subAgent.workspace_id), safeName(subAgent.name));
    await fs.promises.rm(subDir, { recursive: true, force: true });
  } catch {}
}

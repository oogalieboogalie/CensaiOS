import fs from 'fs';
import path from 'path';

export const DEFAULT_READ_MAX_CHARS = 20000;
export const MAX_READ_CHARS = 60000;

export function getWorkspacesRoot() {
  return process.env.CENSAIHUB_WORKSPACES_ROOT
    || process.env.HOMEBASE_WORKSPACES_ROOT
    || path.resolve(process.cwd(), 'workspaces');
}

export function mapProjectPathForRuntime(projectPath) {
  const raw = String(projectPath || '');
  if (!raw) return raw;

  const hostRoot = process.env.HOMEBASE_HOST_PROJECT_ROOT;
  const containerRoot = process.env.HOMEBASE_CONTAINER_PROJECT_ROOT;
  const normalizedContainer = containerRoot?.replace(/\\/g, '/').replace(/\/+$/, '');
  if (hostRoot && containerRoot) {
    const normalizedRaw = raw.replace(/\\/g, '/').toLowerCase();
    const normalizedHost = hostRoot.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    if (normalizedRaw === normalizedHost || normalizedRaw.startsWith(`${normalizedHost}/`)) {
      const suffix = raw.replace(/\\/g, '/').slice(hostRoot.replace(/\\/g, '/').replace(/\/+$/, '').length);
      return path.posix.join(containerRoot, suffix);
    }
  }

  if (normalizedContainer && fs.existsSync(normalizedContainer)) {
    const rawParts = raw.replace(/\\/g, '/').split('/').filter(Boolean);
    const containerParts = normalizedContainer.split('/').filter(Boolean);
    const rawProjectName = rawParts[rawParts.length - 1]?.toLowerCase();
    const containerProjectName = containerParts[containerParts.length - 1]?.toLowerCase();
    if (rawProjectName && rawProjectName === containerProjectName) {
      return normalizedContainer;
    }
  }

  return raw;
}

export function normalizeProjectPathForStorage(projectPath) {
  const raw = String(projectPath || '').trim();
  if (!raw) return raw;
  if (/^[a-z]:[\\/]/i.test(raw)) return raw.replace(/[\\/]+$/, '');
  return path.resolve(raw);
}

export function resolveProjectPathForRuntime(projectPath) {
  return path.resolve(mapProjectPathForRuntime(normalizeProjectPathForStorage(projectPath)));
}

export function safeAgentId(agentId) {
  if (!agentId || !/^[a-z0-9-]+$/i.test(agentId)) throw new Error('Invalid agent id');
  return agentId.toLowerCase();
}

export function safeName(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '');
}

export function getAgentWorkspaceDir(agentId) {
  return path.join(getWorkspacesRoot(), safeAgentId(agentId));
}

export function getSharedWorkspaceDir() {
  return path.join(getWorkspacesRoot(), 'shared');
}

export async function ensureAgentWorkspace(agentId) {
  const dir = getAgentWorkspaceDir(agentId);
  await fs.promises.mkdir(path.join(dir, 'projects'), { recursive: true });
  await fs.promises.mkdir(path.join(dir, 'sub-agents'), { recursive: true });
  return dir;
}

export function resolveInsideProject(projectRoot, relPath) {
  const absRoot = path.resolve(mapProjectPathForRuntime(projectRoot));
  const absTarget = path.resolve(absRoot, relPath || '.');
  const rel = path.relative(absRoot, absTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes project root: ${relPath}`);
  }
  return absTarget;
}

export function isGithubProject(project) {
  return !!(project && project.repo);
}

export function clampReadWindow({ offset = 0, maxChars = DEFAULT_READ_MAX_CHARS } = {}) {
  const safeOffset = Math.max(0, Number.isFinite(Number(offset)) ? Math.floor(Number(offset)) : 0);
  const requestedMax = Number.isFinite(Number(maxChars)) ? Math.floor(Number(maxChars)) : DEFAULT_READ_MAX_CHARS;
  const safeMax = Math.min(Math.max(1, requestedMax), MAX_READ_CHARS);
  return { offset: safeOffset, maxChars: safeMax };
}

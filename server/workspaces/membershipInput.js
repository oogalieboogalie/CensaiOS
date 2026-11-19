// What a board save sends about which agent may use which project, checked
// and tidied before anything is written (server/workspaces/projectMemberships.js).

export const PERMISSIONS = new Set(['read', 'work']);
const MAX_MEMBERSHIPS = 64;
const MAX_WINDOW_PROJECTS = 32;

export class ProjectMembershipError extends Error {
  constructor(message, { code = 'INVALID_PROJECT_MEMBERSHIP', statusCode = 400, readOnly = false } = {}) {
    super(message);
    this.name = 'ProjectMembershipError';
    this.code = code;
    this.statusCode = statusCode;
    // The agent may read the project here but was asked to change it.
    if (readOnly) this.readOnly = true;
  }
}

export function requiredText(value, label) {
  const result = String(value || '').trim();
  if (!result) throw new ProjectMembershipError(`${label} is required.`);
  return result;
}

export function normalizeMemberships(input) {
  if (!Array.isArray(input)) throw new ProjectMembershipError('memberships must be an array.');
  if (input.length > MAX_MEMBERSHIPS) {
    throw new ProjectMembershipError(`memberships cannot contain more than ${MAX_MEMBERSHIPS} entries.`);
  }
  const rows = input.map((entry) => {
    const agentId = requiredText(entry?.agentId, 'agentId');
    const permission = String(entry?.permission || 'work').trim();
    if (!PERMISSIONS.has(permission)) {
      throw new ProjectMembershipError(`Unsupported project permission: ${permission}`);
    }
    return { agentId, permission };
  });
  if (new Set(rows.map((row) => row.agentId)).size !== rows.length) {
    throw new ProjectMembershipError('Agent memberships must be unique.');
  }
  return rows;
}

/**
 * The projects a board's windows are set to (each window's own project menu),
 * each with the agents in those windows. The board's main project is left
 * out: `memberships` already covers it. Two entries for one project merge.
 */
export function normalizeWindowProjects(input, mainProjectId) {
  if (input == null) return [];
  if (!Array.isArray(input)) throw new ProjectMembershipError('windowProjects must be an array.');
  if (input.length > MAX_WINDOW_PROJECTS) {
    throw new ProjectMembershipError(`windowProjects cannot contain more than ${MAX_WINDOW_PROJECTS} entries.`);
  }
  const byProject = new Map();
  for (const entry of input) {
    const projectId = requiredText(entry?.projectId, 'projectId');
    if (projectId === mainProjectId) continue;
    const merged = byProject.get(projectId) || new Map();
    for (const row of normalizeMemberships(entry?.memberships)) {
      const before = merged.get(row.agentId);
      merged.set(row.agentId, before === 'work' ? 'work' : row.permission);
    }
    byProject.set(projectId, merged);
  }
  return [...byProject].map(([projectId, agents]) => ({
    projectId,
    rows: [...agents].map(([agentId, permission]) => ({ agentId, permission })),
  }));
}

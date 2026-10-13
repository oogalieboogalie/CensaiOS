import { getRuntimeMode, RUNTIME_MODES } from '../../middleware/runtimeMode.js';
import { requireWorkspaceMember } from '../../workspaces/context.js';

export const RAW_DATABASE_TOOL_NAMES = Object.freeze([
  'postgres_query',
  'postgres_exec_file',
]);

const RAW_DATABASE_TOOLS = new Set(RAW_DATABASE_TOOL_NAMES);
const CLOUD_OPERATOR_ROLES = new Set(['admin', 'operator']);

export class ToolAccessDeniedError extends Error {
  constructor(message = 'Raw database tools require an authorized cloud operator.') {
    super(message);
    this.name = 'ToolAccessDeniedError';
    this.code = 'TOOL_ACCESS_DENIED';
    this.statusCode = 403;
  }
}

export class ToolAccessUnavailableError extends Error {
  constructor() {
    super('Raw database tool authorization is temporarily unavailable.');
    this.name = 'ToolAccessUnavailableError';
    this.code = 'TOOL_ACCESS_UNAVAILABLE';
    this.statusCode = 503;
  }
}

export function isRawDatabaseTool(name) {
  return RAW_DATABASE_TOOLS.has(String(name || ''));
}

export async function authorizeToolInvocation(db, {
  name,
  context = {},
  mode = getRuntimeMode(),
} = {}) {
  if (!isRawDatabaseTool(name) || mode !== RUNTIME_MODES.CLOUD_SAAS) {
    return { authorized: true, enforced: false };
  }

  const userId = Number(context.userId);
  const workspaceId = String(context.workspaceId || '').trim();
  if (!Number.isInteger(userId) || userId <= 0 || !workspaceId) {
    throw new ToolAccessDeniedError();
  }

  let role;
  try {
    const { rows } = await db.query('SELECT role FROM users WHERE id = $1', [userId]);
    role = String(rows[0]?.role || '').trim().toLowerCase();
  } catch {
    throw new ToolAccessUnavailableError();
  }
  if (!CLOUD_OPERATOR_ROLES.has(role)) throw new ToolAccessDeniedError();

  try {
    await requireWorkspaceMember(db, { userId, workspaceId });
  } catch (error) {
    if (error?.statusCode === 403 || error?.statusCode === 404) {
      throw new ToolAccessDeniedError();
    }
    throw new ToolAccessUnavailableError();
  }

  return { authorized: true, enforced: true, role, userId, workspaceId };
}

export async function canExposeRawDatabaseTools(db, context = {}, options = {}) {
  try {
    await authorizeToolInvocation(db, {
      name: 'postgres_query',
      context,
      mode: options.mode ?? getRuntimeMode(),
    });
    return true;
  } catch {
    return false;
  }
}

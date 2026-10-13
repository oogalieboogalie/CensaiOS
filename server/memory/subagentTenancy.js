import { createHash } from 'node:crypto';

export function resolveSubAgentScope(input = {}, { requireUser = false } = {}) {
  const workspaceId = String(input.workspaceId ?? input.workspace_id ?? '').trim();
  const rawUserId = input.userId ?? input.created_by_user_id;
  const userId = rawUserId === null || rawUserId === undefined || rawUserId === ''
    ? null
    : Number(rawUserId);

  if (!workspaceId) throw subAgentScopeError('Sub-agent access requires an authorized workspace.');
  if (requireUser && (!Number.isInteger(userId) || userId <= 0)) {
    throw subAgentScopeError('Sub-agent writes require an originating user.');
  }
  return { workspaceId, userId: Number.isInteger(userId) && userId > 0 ? userId : null };
}

export function scopedSubAgentId(name, parentId, workspaceId) {
  const slug = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const parent = String(parentId || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const scopeHash = createHash('sha256').update(String(workspaceId)).digest('hex').slice(0, 12);
  return `${slug || 'agent'}-${parent || 'parent'}-${scopeHash}`;
}

export function subAgentScopeError(message) {
  const error = new Error(message);
  error.code = 'SUB_AGENT_SCOPE_REQUIRED';
  error.statusCode = 400;
  return error;
}

export function resolveMemoryScope(input = {}, { requireUser = false } = {}) {
  const workspaceId = String(input.workspaceId ?? input.workspace_id ?? '').trim();
  const rawUserId = input.userId ?? input.created_by_user_id;
  const userId = rawUserId === null || rawUserId === undefined || rawUserId === ''
    ? null
    : Number(rawUserId);

  if (!workspaceId) throw memoryScopeError('Memory access requires an authorized workspace.');
  if (requireUser && (!Number.isInteger(userId) || userId <= 0)) {
    throw memoryScopeError('Memory writes require an originating user.');
  }
  return { workspaceId, userId: Number.isInteger(userId) && userId > 0 ? userId : null };
}

export function memoryScopeError(message) {
  const error = new Error(message);
  error.code = 'MEMORY_SCOPE_REQUIRED';
  error.statusCode = 400;
  return error;
}

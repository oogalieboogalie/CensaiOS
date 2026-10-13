export function requireAutonomyOwnership(input = {}) {
  const workspaceId = String(input.workspaceId ?? input.workspace_id ?? '').trim();
  const userId = Number(input.userId ?? input.created_by_user_id);
  if (!workspaceId || !Number.isInteger(userId) || userId <= 0) {
    const error = new Error('Autonomous work requires an authenticated user and workspace.');
    error.code = 'AUTONOMY_OWNERSHIP_REQUIRED';
    error.statusCode = 400;
    throw error;
  }
  return { workspaceId, userId };
}

export function ownershipFromRow(row = {}) {
  return requireAutonomyOwnership({
    workspaceId: row.workspace_id,
    userId: row.created_by_user_id,
  });
}

import { requireWorkspaceMember } from '../../workspaces/context.js';

const REFUSED = 'Only a board owner or admin can change sub-agents.';

/** Null when this person may create, edit or delete a sub-agent. Otherwise a sentence to show them. */
export async function subAgentWriteRefusal(db, context = {}) {
  try {
    await requireWorkspaceMember(db, {
      userId: context.userId,
      workspaceId: context.workspaceId,
      roles: ['owner', 'admin'],
    });
    return null;
  } catch (error) {
    if (error?.statusCode === 400 || error?.statusCode === 403 || error?.statusCode === 404) return REFUSED;
    return 'Could not check who is changing this sub-agent.';
  }
}

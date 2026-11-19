import { getRuntimeMode, RUNTIME_MODES } from '../middleware/runtimeMode.js';
import { assertSystemAdmin } from '../security/systemAdmin.js';
import * as memberships from './projectMemberships.js';

// On a board an agent works in the projects the board gave it, one entry per
// agent and project (projectMemberships.js). That list exists so a teammate
// on a shared board cannot send an agent into a folder the board never had.
// It is not meant to stop this computer's owner: off a board the owner's
// agents already reach every project (tools/rbac/ownerOnlyReads.js). So when
// the owner drives the chat, an agent the board gave nothing for a project
// still works in it. A teammate's chat keeps the board's list, and a project
// the board gave to read only stays read only for everyone.

/** Whether this computer's owner drives this chat; the desktop app's own work is the owner's. */
export async function ownerDrives(context = {}, { db, mode = getRuntimeMode() } = {}) {
  const userId = Number(context.userId);
  if (!Number.isInteger(userId) || userId <= 0) return context.userId == null && mode === RUNTIME_MODES.LOCAL_DESKTOP;
  try {
    await assertSystemAdmin({ session: { userId } }, { db });
    return true;
  } catch (error) {
    if (error.statusCode === 401 || error.statusCode === 403) return false;
    throw error;
  }
}

/** True for "the board gave this agent nothing for that project", false for read-only and every other failure. */
export const notGiven = (error) => error?.code === 'PROJECT_ACCESS_DENIED' && !error.readOnly;

/** assertAgentProjectAccess, passing when this computer's owner drives the chat and the board gave nothing. */
export async function assertProjectForDriver(db, options, context = {}, deps = {}) {
  try {
    return await memberships.assertAgentProjectAccess(db, options);
  } catch (error) {
    if (!notGiven(error) || !(await ownerDrives(context, { db, ...deps }))) throw error;
    return { workspaceId: options.workspaceId, projectId: options.projectId, agentId: options.agentId, permission: 'work' };
  }
}

/** assertAgentRepoAccess, passing when this computer's owner drives the chat and the board gave nothing. */
export async function assertRepoForDriver(db, options, context = {}, deps = {}) {
  try {
    return await memberships.assertAgentRepoAccess(db, options);
  } catch (error) {
    if (!notGiven(error) || !(await ownerDrives(context, { db, ...deps }))) throw error;
    return { workspaceId: options.workspaceId, projectId: null, agentId: options.agentId, permission: 'work' };
  }
}

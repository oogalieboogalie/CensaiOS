import { actorFromRequest } from '../context/actorContext.js';
import { workspaceContextFromRequest } from '../context/requestContext.js';
import { getRequestContext } from '../middleware/runtimeMode.js';

function readOptionalWorkspaceId(req) {
  try {
    return workspaceContextFromRequest(req).workspaceId;
  } catch {
    return null;
  }
}

export function commandContextFromRequest(req) {
  const requestContext = getRequestContext(req);
  const userRole = String(req?.session?.userRole ?? 'user').trim().toLowerCase();
  return {
    tenantId: requestContext.tenantId ?? null,
    userId: String(req?.session?.userId ?? '').trim() || null,
    userRole,
    workspaceId: requestContext.workspaceId || readOptionalWorkspaceId(req),
    actor: actorFromRequest(req),
    principal: requestContext.principal ?? userRole,
    runtimeMode: requestContext.runtimeMode,
  };
}

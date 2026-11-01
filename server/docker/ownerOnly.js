import { createLogger } from '../logger.js';
import { assertSystemAdmin, requireSystemAdmin } from '../security/systemAdmin.js';

// Docker on this computer is the owner's alone: changes AND reads. Container
// lists, details and logs can carry addresses and tokens, so a teammate gets
// the same owner-only refusal for a look as for a stop. The 'docker' log line
// names the account number and which kind of route, never a container name
// or anything the person typed.

const log = createLogger('docker');
const KNOWN = new Set(['status', 'containers', 'stats', 'images', 'volumes', 'networks', 'compose', 'prune', 'logs', 'exec', 'history']);

/** A route name safe to log: known words only, ':id' for anything else. */
export function dockerRouteLabel(path = '') {
  const parts = String(path).split('?')[0].split('/').filter(Boolean).slice(0, 3);
  return `/${parts.map((p) => (KNOWN.has(p) ? p : ':id')).join('/')}`;
}

export async function dockerOwnerOnly(req, res, next) {
  let owner = false;
  try {
    await assertSystemAdmin(req);
    owner = true;
  } catch (err) {
    if (err.statusCode === 403) {
      const kind = req.method === 'GET' || req.method === 'HEAD' ? 'read' : 'change';
      log.info(`refused ${kind} ${dockerRouteLabel(req.path)} for account ${Number(req.session?.userId)}: not the owner`);
    }
  }
  if (owner) return next();
  // The shared refusal: 401 or 403 with the owner-only code the window knows.
  return requireSystemAdmin(req, res, next);
}

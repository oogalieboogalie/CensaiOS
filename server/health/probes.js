import { getSystemStatus } from '../health.js';
import { runnerClient } from '../runner/client.js';
import { isComputerOwner } from '../security/systemAdmin.js';

// What an anonymous probe is allowed to see. Docker, CI and flex only need
// this plus the HTTP status (/api/health stays 200 so a process that can
// answer is healthy; /api/ready stays 503 until the app is ready).
export function publicHealthBody(status) {
  return { ok: Boolean(status?.ok) };
}

// The shape the owner's windows already read (Live Operations, task queue).
export function ownerHealthBody(status, runnerStatus) {
  return {
    ...status,
    hasKey: status.modelProvider.hasKey,
    provider: status.modelProvider.baseUrl,
    model: status.modelProvider.model,
    database: status.database.connected,
    databaseStatus: {
      ready: status.database.connected,
      degraded: !status.database.connected,
      degradedReason: status.degradedState,
      error: status.database.error,
    },
    runner: runnerStatus,
  };
}

// Anonymous /api/ready. Names, error text, and row counts stay off this
// answer. Each part keeps only its ready and connected flags.
function partFlags(part) {
  const flags = {};
  if (typeof part.ready === 'boolean') flags.ready = part.ready;
  if (typeof part.connected === 'boolean') flags.connected = part.connected;
  return flags;
}

export function publicReadyBody(status) {
  const body = {
    ok: Boolean(status?.ok),
    ready: Boolean(status?.ready),
    degraded: Boolean(status?.degraded),
    degradedState: typeof status?.degradedState === 'string' ? status.degradedState : null,
  };
  if (!status || typeof status !== 'object') return body;
  for (const [key, value] of Object.entries(status)) {
    if (Object.prototype.hasOwnProperty.call(body, key)) continue;
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const flags = partFlags(value);
    if (Object.keys(flags).length > 0) body[key] = flags;
  }
  return body;
}

// Owner detail only for this computer's own admin. A hub sign-in stores that
// account's id in userId (a different table, so hub account 1 is not user 1),
// and a guest pass is not an owner either. Health and ready skip the session
// guard, so this check is the one that keeps their answer public. No session,
// a bad id, or a database we cannot ask: the public answer, never a guess.
export async function callerMaySeeHealthDetail(req) {
  const session = req?.session;
  if (!session || session.hubAccount || session.guest) return false;
  const userId = Number(session.userId);
  if (!Number.isInteger(userId) || userId <= 0) return false;
  try {
    return await isComputerOwner(req);
  } catch {
    return false;
  }
}

async function showDetail(maySeeDetail, req) {
  try {
    return Boolean(await maySeeDetail(req));
  } catch {
    return false;
  }
}

export function mountHealthProbes(app, deps = {}) {
  const loadStatus = deps.getSystemStatus || getSystemStatus;
  const loadRunner = deps.getRunnerHealth || (() => runnerClient.getHealth());
  const maySeeDetail = deps.maySeeDetail || callerMaySeeHealthDetail;

  app.get('/api/health', async (req, res) => {
    const status = await loadStatus();
    if (!(await showDetail(maySeeDetail, req))) {
      res.json(publicHealthBody(status));
      return;
    }
    res.json(ownerHealthBody(status, await loadRunner()));
  });

  app.get('/api/ready', async (req, res) => {
    const status = await loadStatus();
    const body = (await showDetail(maySeeDetail, req)) ? status : publicReadyBody(status);
    res.status(status.ready ? 200 : 503).json(body);
  });
}

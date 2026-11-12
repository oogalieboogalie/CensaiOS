// Kraken Requests (server/kraken): paste a report, see who would get each
// finding, then hand it out. Each person sees, and stops, only their own
// requests on the board they are on.
import express from 'express';
import pool from '../../db.js';
import { can, memberPrincipal } from '../../access/policy.js';
import { createLogger } from '../../logger.js';
import { safeErrorCode } from '../../security/errorCode.js';
import { clip } from '../../censaiOrchestrator/shape.js';
import { MODES, buildArms, previewArms, publicRequest } from '../../kraken/arms.js';
import { feed, stopRequest } from '../../kraken/feeder.js';
import { ReportInputError, parseReport } from '../../kraken/parse.js';
import { getRequest, insertRequest, listOpenRequests, listRequests } from '../../kraken/store.js';
import { requireDb } from './shared.js';
import { agentRouteError, resolveAgentRouteScope } from './scope.js';

export const krakenRouter = express.Router();
const log = createLogger('kraken');
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_YOURS = 'No Kraken Request of yours has that id.';

async function scoped(req, res) {
  try {
    const scope = await resolveAgentRouteScope(req);
    return { ...scope, userId: Number(scope.userId) };
  } catch (error) {
    agentRouteError(res, error);
    return null;
  }
}

/** The report in the request body as { title, mode, project, arms, dropped }. Throws ReportInputError. */
function readReport(body = {}) {
  const mode = MODES.includes(body.mode) ? body.mode : 'writeup';
  const project = clip(body.project, 200) || null;
  if (mode === 'fix' && !project) {
    throw new ReportInputError('To have the family fix things, say which project the work is in. Without one they write up what to change.');
  }
  const parsed = parseReport(body.report);
  const arms = buildArms(parsed.findings, { mode, project, only: body.only });
  if (!arms.length) throw new ReportInputError('Pick at least one finding to hand out.');
  return { title: clip(body.title, 160) || parsed.title, mode, project, arms, dropped: parsed.dropped };
}

const STILL_OUT = 'A Kraken Request of yours is still out. Wait for it to finish, or stop it first.';

function refuse(res, error, what) {
  if (error instanceof ReportInputError) return res.status(400).json({ error: error.message });
  if (error?.code === '23505') return res.status(409).json({ error: STILL_OUT }); // two releases at once
  log.warn(`${what} failed`, { code: safeErrorCode(error) });
  return res.status(500).json({ error: `Could not ${what}.` });
}

// Who would get what, without starting anything.
krakenRouter.post('/kraken/preview', requireDb, async (req, res) => {
  const scope = await scoped(req, res);
  if (!scope) return;
  try {
    const { title, mode, project, arms, dropped } = readReport(req.body);
    res.json({ title, mode, project, dropped, arms: previewArms(arms) });
  } catch (error) {
    refuse(res, error, 'read that report');
  }
});

krakenRouter.post('/kraken/requests', requireDb, async (req, res) => {
  const scope = await scoped(req, res);
  if (!scope) return;
  if (!can(memberPrincipal(scope.role), 'agent.ask')) {
    return res.status(403).json({ error: 'You can look at this board but not start work on it.' });
  }
  try {
    const { title, mode, project, arms } = readReport(req.body);
    const person = { workspaceId: scope.workspaceId, userId: scope.userId };
    if ((await listOpenRequests(pool, person)).length) {
      return res.status(409).json({ error: STILL_OUT });
    }
    const row = await insertRequest(pool, { ...person, title, project, mode, arms });
    log.info('kraken request made', { requestId: row.id, arms: arms.length, mode, agents: [...new Set(arms.map((arm) => arm.agentId))] });
    await feed(person).catch((error) => log.warn('first arms not handed out', { requestId: row.id, code: safeErrorCode(error) }));
    res.status(201).json({ request: publicRequest(await getRequest(pool, { id: row.id, ...person }) || row) });
  } catch (error) {
    refuse(res, error, 'start that Kraken Request');
  }
});

krakenRouter.get('/kraken/requests', requireDb, async (req, res) => {
  const scope = await scoped(req, res);
  if (!scope) return;
  const person = { workspaceId: scope.workspaceId, userId: scope.userId };
  try {
    await feed(person).catch((error) => log.warn('arms not caught up', { code: safeErrorCode(error) }));
    const rows = await listRequests(pool, { ...person, limit: req.query.limit });
    res.json({ requests: rows.map(publicRequest) });
  } catch (error) {
    refuse(res, error, 'load your Kraken Requests');
  }
});

krakenRouter.post('/kraken/requests/:id/stop', requireDb, async (req, res) => {
  const scope = await scoped(req, res);
  if (!scope) return;
  if (!REQUEST_ID.test(req.params.id)) return res.status(404).json({ error: NOT_YOURS });
  if (!can(memberPrincipal(scope.role), 'agent.ask')) {
    return res.status(403).json({ error: 'You can look at this board but not stop work on it.' });
  }
  try {
    const row = await stopRequest({ id: req.params.id, workspaceId: scope.workspaceId, userId: scope.userId });
    if (!row) return res.status(404).json({ error: NOT_YOURS });
    log.info('kraken request stopped from the window', { requestId: row.id });
    res.json({ request: publicRequest(row) });
  } catch (error) {
    refuse(res, error, 'stop that Kraken Request');
  }
});

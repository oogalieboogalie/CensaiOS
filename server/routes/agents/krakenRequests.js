// Kraken Requests (server/kraken): paste a report, see who would get each
// finding, then hand it out. Each person sees, and stops, only their own
// requests on the board they are on.
//
// The look pins the project: it is found once, the way Censai's chat finds one
// before a hand-off, and comes back as an exact pin (which project, where its
// code is, which branch). The release sends that pin back and it is checked
// again, so switching projects between the look and the release cannot move
// the work (server/censaiOrchestrator/projectPin.js).
import express from 'express';
import pool from '../../db.js';
import { can, memberPrincipal } from '../../access/policy.js';
import { createLogger } from '../../logger.js';
import { safeErrorCode } from '../../security/errorCode.js';
import { checkPin, readPin, resolvePin } from '../../censaiOrchestrator/projectPin.js';
import { clip } from '../../censaiOrchestrator/shape.js';
import { MODES, buildArms, previewArms, publicPin, publicRequest, withTaskIds } from '../../kraken/arms.js';
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

const modeOf = (body = {}) => (MODES.includes(body.mode) ? body.mode : 'writeup');
const NO_FIX_PROJECT = 'To have the family fix things, say which project the work is in. Without one they write up what to change.';
const LOOK_FIRST = 'Press "See who gets what" first, so you can see which project and branch the work will run in. Nothing was handed out.';

const VIEWER_NOTE = 'Which project the work would run in is shown only to people who can start work on this board.';
const namedIn = (body = {}) => [clip(body.projectId, 200), clip(body.project, 200)].filter(Boolean);

/**
 * The project the body picks, pinned (null: there is none to pin). projectId is the id the
 * window knows for the project it shows, and wins over the name: two projects can share a name.
 * A fix needs its project. A write-up does not: a name that finds nothing leaves it with no
 * pin, and the look says so (the window fills the box in with the board's project by itself).
 */
async function pinFor(body = {}, mode, person) {
  const named = namedIn(body);
  let pin = null;
  for (const project of named.length ? named : [null]) {
    pin = await resolvePin(pool, person, { project, tests: mode === 'fix' });
    if (pin) break;
  }
  if (named.length && !pin && mode === 'fix') {
    throw new ReportInputError(`No project called "${clip(body.project || named[0], 80)}" is open to you on this board. Name it the way Projects does.`);
  }
  if (mode === 'fix' && !pin) throw new ReportInputError(NO_FIX_PROJECT);
  return pin;
}

/** The report in the request body as { title, arms, dropped }, for work in the pinned project. Throws ReportInputError. */
function readReport(body = {}, mode, pin) {
  const parsed = parseReport(body.report);
  const arms = buildArms(parsed.findings, { mode, project: pin?.projectId || null, only: body.only });
  if (!arms.length) throw new ReportInputError('Pick at least one finding to hand out.');
  return { title: clip(body.title, 160) || parsed.title, arms, dropped: parsed.dropped };
}

const STILL_OUT = 'A Kraken Request of yours is still out. Wait for it to finish, or stop it first.';

function refuse(res, error, what) {
  if (error instanceof ReportInputError) return res.status(400).json({ error: error.message });
  if (error?.code === '23505') return res.status(409).json({ error: STILL_OUT }); // two releases at once
  log.warn(`${what} failed`, { code: safeErrorCode(error) });
  return res.status(500).json({ error: `Could not ${what}.` });
}

// Who would get what, and in which project, without starting anything.
krakenRouter.post('/kraken/preview', requireDb, async (req, res) => {
  const scope = await scoped(req, res);
  if (!scope) return;
  try {
    const mode = modeOf(req.body);
    parseReport(req.body?.report); // a report with nothing in it is said before any project is looked for
    // Someone who can only look sees who would get what, but no project is looked up for them:
    // a pin names a folder on this computer, a branch and a commit.
    const mayWork = can(memberPrincipal(scope.role), 'agent.ask');
    const pin = mayWork ? await pinFor(req.body, mode, { workspaceId: scope.workspaceId, userId: scope.userId }) : null;
    const named = namedIn(req.body);
    let pinNote = mayWork ? '' : VIEWER_NOTE;
    if (mayWork && !pin && named.length) {
      pinNote = `No project called "${clip(req.body.project || named[0], 80)}" is open to you on this board, so this write-up will go out with no project: each family member looks in its own. To pin one, name it the way Projects does.`;
    }
    const { title, arms, dropped } = readReport(req.body, mode, pin);
    res.json({ title, mode, project: pin?.name || null, pin: publicPin(pin), pinNote, dropped, arms: previewArms(arms) });
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
    const mode = modeOf(req.body);
    const person = { workspaceId: scope.workspaceId, userId: scope.userId };
    parseReport(req.body?.report);
    // The pin from the look, checked again. With none sent, there must be no project to pin at all.
    const pin = readPin(req.body?.pin);
    if (pin) {
      const moved = await checkPin(pool, person, pin);
      if (moved) return res.status(409).json({ error: `${moved.why} Nothing was handed out. Press "See who gets what" again, then release.` });
    } else if (await pinFor(req.body, mode, person)) {
      return res.status(409).json({ error: LOOK_FIRST });
    }
    if (mode === 'fix' && !pin) throw new ReportInputError(NO_FIX_PROJECT);
    const { title, arms } = readReport(req.body, mode, pin);
    if ((await listOpenRequests(pool, person)).length) {
      return res.status(409).json({ error: STILL_OUT });
    }
    const row = await insertRequest(pool, { ...person, title, project: pin?.name || null, pin, mode, arms: withTaskIds(arms) });
    log.info('kraken request made', { requestId: row.id, arms: arms.length, mode, pinned: Boolean(pin), agents: [...new Set(arms.map((arm) => arm.agentId))] });
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

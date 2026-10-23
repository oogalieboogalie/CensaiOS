// server/routes/apiBar.js
//
// The API Bar: one front door with a doorman. Every caller sends the same
// shaped note to one address,
//   POST /api/bar   { "api_bar": { "branch": "finance", "action": "search", "paginate": true }, "query": "coffee" }
//   (or POST|PUT|GET /api/bar/<branch>/<action>)
// and the doorman checks the key, passes the note to the API behind that
// branch, pages the list once, signs the answer and carries it back.
//   GET    /api/bar            the menu: every branch and action in plain words
//   GET    /api/bar/keys       your bar keys          (signed-in only)
//   POST   /api/bar/keys       make a key             (signed-in only)
//   DELETE /api/bar/keys/:id   revoke a key           (signed-in only)
//   GET    /api/bar/log        who knocked, and how it went (signed-in only)
// Mounted before the sign-in guard: a bar key stands in for a sign-in, but
// only for the branches its owner picked.

import express from 'express';
import pool from '../db.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { isSessionAuthorized } from '../security/authPolicy.js';
import { getInstallSigner } from '../agentNetwork/installIdentity.js';
import { createLimiter } from '../agentEndpoints/rateLimit.js';
import { BRANCH_NAMES, describeMenu, findAction } from '../apiBar/catalog.js';
import { dispatchInternal } from '../apiBar/dispatch.js';
import { BAR_HANDLERS } from '../apiBar/handlers.js';
import { pageAnswer } from '../apiBar/paging.js';
import { stampAnswer } from '../apiBar/signing.js';
import { defaultAgentCalls } from '../apiBar/agentCalls.js';
import * as keyStore from '../apiBar/keys.js';
import { isJestRun } from '../security/testShortcut.js';

const log = createLogger('api-bar');
const BAR_FIELDS = ['branch', 'action', 'paginate', 'page', 'page_size'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class Refusal extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const noteSize = (value) => {
  try {
    return JSON.stringify(value ?? null).length;
  } catch {
    return 0;
  }
};

export function createApiBarRouter(overrides = {}) {
  const deps = {
    db: pool,
    keys: keyStore,
    limiter: createLimiter(),
    getSigner: () => getInstallSigner(pool),
    handlers: BAR_HANDLERS,
    dispatch: dispatchInternal,
    agentCalls: null,
    testSession: isJestRun(),
    ...overrides,
  };
  if (!deps.agentCalls) deps.agentCalls = defaultAgentCalls();
  const router = express.Router();

  /** Who is knocking: a bar key, or the person signed in on the board. */
  async function identify(req) {
    const token = keyStore.barTokenFromRequest(req);
    if (token) {
      const row = keyStore.isBarTokenShape(token) ? await deps.keys.findKeyByToken(deps.db, token) : null;
      if (!row || row.revoked_at) {
        const slow = deps.limiter.badKey(req.ip);
        throw new Refusal(slow.ok ? 401 : 429, 'The doorman does not know that key. Make one in the API Bar window.');
      }
      // The key owner must still be let in on this install.
      if (!deps.testSession && !isSessionAuthorized({ userId: row.user_id, userEmail: row.user_email })) {
        throw new Refusal(403, 'The person who made this key no longer has access here.');
      }
      return {
        userId: row.user_id, keyId: row.id, keyLabel: row.label, branches: row.branches || [], lookOnly: Boolean(row.look_only),
        asUser: { userId: row.user_id, userEmail: row.user_email, userRole: row.user_role, userName: row.user_name },
      };
    }
    if (deps.testSession && req.session && !req.session.userId) req.session.userId = 1;
    if (!req.session?.userId) throw new Refusal(401, 'Sign in, or send a bar key ("Authorization: Bearer cbk_...").');
    if (!deps.testSession && !isSessionAuthorized(req.session)) throw new Refusal(403, 'Access denied. This private beta requires an invitation.');
    return { userId: req.session.userId, keyId: null, keyLabel: null, branches: null, lookOnly: false, asUser: null };
  }

  const guard = (handler, { signedInOnly = false } = {}) => async (req, res) => {
    try {
      const caller = await identify(req);
      if (signedInOnly && caller.keyId) throw new Refusal(403, 'A bar key cannot manage keys. Use the API Bar window on the board.');
      await handler(req, res, caller);
    } catch (error) {
      const status = error instanceof Refusal ? error.status : (error.statusCode || 500);
      if (status >= 500) log.error('api bar failed', { code: safeErrorCode(error) });
      res.status(status).json({ ok: false, error: status >= 500 ? 'The doorman tripped. Try again.' : error.message });
    }
  };

  async function callBar(req, res, caller, { branch, action, bar, input }) {
    const started = Date.now();
    const logKnock = (status, error, out = null) => deps.keys.logCall(deps.db, {
      userId: caller.userId, keyId: caller.keyId, branch: branch || '?', action: action || '?', method: req.method, status,
      durationMs: Date.now() - started, noteIn: noteSize(input), noteOut: noteSize(out), error,
    }).catch((e) => log.warn('knock not logged', { code: safeErrorCode(e) }));
    // Turned away at the door: still logged, so a leaked key shows up.
    const refuse = (status, message) => {
      logKnock(status, message);
      return new Refusal(status, message);
    };
    const entry = findAction(branch, action);
    if (!entry) throw refuse(404, `There is no "${branch}/${action}" here. Branches: ${BRANCH_NAMES.join(', ')}. GET /api/bar shows the menu.`);
    if (entry.changes && req.method === 'GET') throw refuse(405, 'This action spends or changes something, so send it with POST.');
    if (caller.branches && !caller.branches.includes(branch)) throw refuse(403, `This key cannot open the ${branch} branch.`);
    if (entry.changes && caller.lookOnly) throw refuse(403, 'This key is look only. It cannot run actions that spend or change things.');
    const slot = caller.keyId ? deps.limiter.acquire(caller.keyId) : null;
    if (slot && !slot.ok) {
      res.set('Retry-After', String(slot.retryAfter));
      throw refuse(429, 'Too many notes with this key. Try again in a minute.');
    }
    let answer;
    try {
      const signer = await deps.getSigner().catch(() => null);
      if (entry.run) {
        answer = await deps.handlers[entry.run]({
          req, res, input, signer, deps, userId: caller.userId, asUser: caller.asUser, keyId: caller.keyId, keyLabel: caller.keyLabel,
        });
      } else {
        const query = Object.fromEntries((entry.query || []).map((k) => [k, input[k]]));
        // Which board: the route behind the branch checks the caller may use it.
        if (input.workspaceId) query.workspaceId = input.workspaceId;
        answer = await deps.dispatch(req, res, {
          method: entry.method, path: entry.path, query, body: entry.body ? input : undefined, asUser: caller.asUser,
        });
      }
      const ok = answer.status < 400;
      const { data, paging } = ok ? pageAnswer(answer.data, entry.listKey, bar) : { data: answer.data, paging: null };
      const signed = stampAnswer(signer, { branch, action, status: answer.status, answer: data, agent: answer.agent || null });
      logKnock(answer.status, ok ? null : data?.error, data);
      if (caller.keyId) deps.keys.touchKey(deps.db, caller.keyId).catch(() => {});
      res.status(answer.status).json({
        ok,
        api_bar: { branch, action, status: answer.status, paginate: Boolean(paging), ...(paging || {}) },
        answer: data,
        signed,
      });
    } finally {
      slot?.release();
    }
  }

  function noteFromBody(req) {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const bar = body.api_bar && typeof body.api_bar === 'object' ? body.api_bar : {};
    let input = body.input && typeof body.input === 'object' ? body.input : null;
    if (!input) {
      input = { ...body };
      delete input.api_bar;
    }
    return { bar, input };
  }

  function noteFromQuery(req) {
    const bar = {};
    const input = {};
    for (const [key, value] of Object.entries(req.query || {})) {
      if (BAR_FIELDS.includes(key)) bar[key] = value; else input[key] = value;
    }
    return { bar, input };
  }

  router.get('/', guard(async (req, res, caller) => {
    if (req.query.branch && req.query.action) {
      const { bar, input } = noteFromQuery(req);
      return callBar(req, res, caller, { branch: String(bar.branch), action: String(bar.action), bar, input });
    }
    res.json({
      ok: true,
      doorman: 'One door, one note shape. Put api_bar.branch and api_bar.action in the note; the doorman passes it to that API and carries the answer back, signed.',
      note_shape: { api_bar: { branch: 'finance', action: 'search', paginate: true, page: 1, page_size: 25 }, query: 'coffee' },
      key: caller.keyId ? { label: caller.keyLabel, branches: caller.branches, look_only: caller.lookOnly } : null,
      branches: describeMenu({ allowed: caller.branches }),
    });
  }));

  router.get('/keys', guard(async (_req, res, caller) => {
    res.json({ keys: (await deps.keys.listKeys(deps.db, { userId: caller.userId })).map(keyStore.keyView) });
  }, { signedInOnly: true }));

  router.post('/keys', guard(async (req, res, caller) => {
    try {
      const { token, row } = await deps.keys.createKey(deps.db, {
        userId: caller.userId, label: req.body?.label, branches: req.body?.branches, lookOnly: req.body?.lookOnly !== false,
      });
      res.json({ key: keyStore.keyView(row), token, shownOnce: true });
    } catch (error) {
      if (error instanceof keyStore.BarKeyError) throw new Refusal(error.statusCode, error.message);
      throw error;
    }
  }, { signedInOnly: true }));

  router.delete('/keys/:id', guard(async (req, res, caller) => {
    if (!UUID.test(req.params.id)) throw new Refusal(404, 'No key with that id.');
    const row = await deps.keys.revokeKey(deps.db, { userId: caller.userId, keyId: req.params.id });
    if (!row) throw new Refusal(404, 'No key with that id.');
    res.json({ key: keyStore.keyView(row) });
  }, { signedInOnly: true }));

  router.get('/log', guard(async (req, res, caller) => {
    res.json({ calls: await deps.keys.listCalls(deps.db, { userId: caller.userId, limit: req.query.limit }) });
  }, { signedInOnly: true }));

  const callFromBody = guard(async (req, res, caller) => {
    const { bar, input } = noteFromBody(req);
    return callBar(req, res, caller, { branch: String(bar.branch || ''), action: String(bar.action || ''), bar, input });
  });
  router.post('/', callFromBody);
  router.put('/', callFromBody);

  const callFromPath = guard(async (req, res, caller) => {
    const { bar, input } = req.method === 'GET' ? noteFromQuery(req) : noteFromBody(req);
    return callBar(req, res, caller, { branch: req.params.branch, action: req.params.action, bar, input });
  });
  router.get('/:branch/:action', callFromPath);
  router.post('/:branch/:action', callFromPath);
  router.put('/:branch/:action', callFromPath);

  return router;
}

export const apiBarRouter = createApiBarRouter();

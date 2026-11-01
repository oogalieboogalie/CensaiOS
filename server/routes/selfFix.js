/**
 * Self-fix routes (server/selfFix/).
 *
 * POST /api/self-fix/reports              a browser error (any signed-in member)
 * GET  /api/self-fix                      switch state + every report (admin)
 * GET  /api/self-fix/notices              fixes to tell the owner about (admin)
 * POST /api/self-fix/notices/:id/seen     { status } the notice was shown
 * POST /api/self-fix/settings             { autoFix: true|false|null, dailyCap }
 * POST /api/self-fix/reports/:id/fix      try to fix a saved report now
 * POST /api/self-fix/reports/:id/undo     take a fix back out
 * GET  /api/self-fix/reports/:id/patch    the fix as a patch (for the crew)
 *
 * Sits behind requireLocalFilesystem: fixes change this computer's own copy.
 */

import express from 'express';
import { requireSystemAdmin, assertSystemAdmin } from '../security/systemAdmin.js';
import { getSelfFix } from '../selfFix/index.js';
import { readPatch } from '../selfFix/patches.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';

const log = createLogger('self-fix-route');
export const selfFixRouter = express.Router();

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const recent = new Map(); // session/user → timestamps

function allowReport(req) {
  const key = String(req.session?.userId ?? req.ip);
  const now = Date.now();
  const list = (recent.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) return false;
  list.push(now);
  recent.set(key, list);
  return true;
}

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    if (status >= 500) log.warn('self-fix request failed', { code: safeErrorCode(error) });
    res.status(status).json({ error: status >= 500 ? 'Self-fix hit a problem.' : error.message });
  }
};

/** What the Settings list shows: no full bundle, just enough to read it. */
function view(report) {
  const { bundle, ...rest } = report;
  return { ...rest, stack: bundle?.stack || '', actions: bundle?.actions || [] };
}

selfFixRouter.post('/reports', wrap(async (req, res) => {
  if (process.env.CENSAI_SELF_FIX === 'off') return res.status(202).json({ ok: false });
  if (!allowReport(req)) return res.status(429).json({ error: 'Too many reports at once.' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  // Only the owner's own errors start a fix by themselves. A teammate's report
  // is saved for the owner to read first: its text goes into a coding agent's
  // instructions, so nobody else gets to write those.
  const fromOwner = await assertSystemAdmin(req).then(() => true, () => false);
  const report = getSelfFix().capture({ ...body, source: 'browser' }, { canFix: fromOwner });
  res.status(202).json({ ok: Boolean(report), id: report?.id || null });
}));

selfFixRouter.get('/', requireSystemAdmin, wrap(async (_req, res) => {
  const selfFix = getSelfFix();
  res.json({ state: await selfFix.state(), reports: selfFix.store.list().map(view) });
}));

selfFixRouter.get('/notices', requireSystemAdmin, wrap(async (_req, res) => {
  const notices = getSelfFix().store.list()
    .filter((r) => (r.status === 'ready' || r.status === 'applied') && !r.seen?.[r.status])
    .map((r) => ({ id: r.id, status: r.status, title: r.title, summary: r.fix?.summary || null }));
  res.json({ notices });
}));

selfFixRouter.post('/notices/:id/seen', requireSystemAdmin, wrap(async (req, res) => {
  const store = getSelfFix().store;
  const report = store.get(req.params.id);
  if (!report) return res.status(404).json({ error: 'No such report.' });
  store.update(report.id, { seen: { ...(report.seen || {}), [String(req.body?.status || report.status)]: true } });
  res.json({ ok: true });
}));

selfFixRouter.post('/settings', requireSystemAdmin, wrap(async (req, res) => {
  const selfFix = getSelfFix();
  const patch = {};
  if (req.body && 'autoFix' in req.body) patch.autoFix = req.body.autoFix;
  if (req.body && 'dailyCap' in req.body) patch.dailyCap = req.body.dailyCap;
  selfFix.store.setSettings(patch);
  res.json({ state: await selfFix.state() });
}));

selfFixRouter.post('/reports/:id/fix', requireSystemAdmin, wrap(async (req, res) => {
  const selfFix = getSelfFix();
  const report = selfFix.store.get(req.params.id);
  if (!report) return res.status(404).json({ error: 'No such report.' });
  if (!['saved', 'failed', 'undone'].includes(report.status)) return res.status(409).json({ error: 'That report is already being handled.' });
  selfFix.store.update(report.id, { status: 'saved', fix: null });
  const started = await selfFix.maybeFix(selfFix.store.get(report.id), { manual: true });
  res.json({ started, report: view(selfFix.store.get(report.id)) });
}));

selfFixRouter.post('/reports/:id/undo', requireSystemAdmin, wrap(async (req, res) => {
  res.json({ report: view(await getSelfFix().undo(req.params.id)) });
}));

selfFixRouter.get('/reports/:id/patch', requireSystemAdmin, wrap(async (req, res) => {
  const patch = readPatch(getSelfFix().repoRoot, req.params.id);
  if (!patch) return res.status(404).json({ error: 'No patch for that report.' });
  res.type('text/plain').send(patch);
}));

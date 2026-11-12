// A Kraken Request hands its arms to the family a few at a time. Each arm
// becomes one of Censai's plans (server/censaiOrchestrator), so the person sees
// it in Censai's chat like any other plan, with its steps and its checklist.
//
// At most KRAKEN_SLOTS of a person's plans come from a Kraken Request at once,
// which leaves room for something they ask Censai themselves. When one of its
// plans finishes, gets stuck or is stopped, the next waiting arm goes out
// (onPlanSettled), and looking at the request (the window, on a timer) does the
// same, so a restart never leaves arms waiting for ever.

import pool from '../db.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { FINAL_PLAN, PlanInputError, clip, normalizePlanInput } from '../censaiOrchestrator/shape.js';
import { MAX_OPEN_PLANS, countOpenPlans, getPlan, loadPlan } from '../censaiOrchestrator/store.js';
import { createPlan, onPlanSettled, recoverOnce, stopPlan } from '../censaiOrchestrator/runner.js';
import { handOffGap } from '../tools/handlers/censaiOrchestrator.js';
import { FINAL_ARM, asWriteup, planInput } from './arms.js';
import { getRequest, listOpenOwners, listOpenRequests, saveRequest } from './store.js';

const log = createLogger('kraken');
export const KRAKEN_SLOTS = Math.max(1, MAX_OPEN_PLANS - 1);
const WORKERS = ['owner', 'admin', 'member'];

export const DEFAULT_DEPS = Object.freeze({
  db: pool, createPlan, stopPlan, getPlan, countOpenPlans, handOffGap, recoverOnce,
  requireMember: requireWorkspaceMember,
});

const lines = new Map(); // "board:person" -> the last piece of work in line for them

// One piece of work at a time for each person, so two looks at once never hand the same arm out twice.
function inLine(scope, work) {
  const key = `${scope.workspaceId}:${scope.userId}`;
  const next = (lines.get(key) || Promise.resolve()).then(work);
  const tail = next.catch(() => {}).finally(() => {
    if (lines.get(key) === tail) lines.delete(key);
  });
  lines.set(key, tail);
  return next;
}

const fromRow = (row) => ({ id: row.id, project: row.project, mode: row.mode, status: row.status, arms: structuredClone(row.arms || []) });

/** Bring each handed-out arm up to date with its plan. True when something changed. */
async function sync(request, scope, deps) {
  let changed = false;
  for (const arm of request.arms.filter((item) => item.status === 'handed')) {
    const plan = await deps.getPlan(deps.db, { id: arm.planId, ...scope });
    if (plan && !FINAL_PLAN.has(plan.status)) continue;
    arm.status = plan ? plan.status : 'stuck';
    arm.result = plan ? clip(plan.summary || '', 400) : 'Its plan could not be found.';
    changed = true;
  }
  return changed;
}

/** A fix that could never be checked off here goes out as a write-up instead, with the reason on the arm. */
async function fitToBoard(request, arm, input, scope, deps) {
  if (arm.kind !== 'code') return input;
  const member = await deps.requireMember(deps.db, { ...scope, roles: WORKERS }).catch(() => null);
  const gap = member
    ? await deps.handOffGap(input, scope, member, deps.db, deps.planDeps || {})
    : 'Error: You can look at this board but not change its project.';
  if (!gap) return input;
  asWriteup(arm, String(gap).replace(/^Error:\s*/, '').split(/(?<=[.!?])\s/)[0]);
  return normalizePlanInput(planInput(request, arm));
}

/** Hand waiting arms out while there is room. Saves after each one. False once the request is no longer open. */
async function handOut(request, scope, deps) {
  for (const arm of request.arms.filter((item) => item.status === 'waiting')) {
    if (await deps.countOpenPlans(deps.db, scope) >= KRAKEN_SLOTS) break;
    try {
      const input = await fitToBoard(request, arm, normalizePlanInput(planInput(request, arm)), scope, deps);
      const plan = await deps.createPlan({ ...scope, ...input }, deps.planDeps || {});
      arm.status = 'handed';
      arm.planId = plan.id;
      log.info('arm handed out', { requestId: request.id, arm: arm.n, agentId: arm.agentId, planId: plan.id });
    } catch (error) {
      if (!(error instanceof PlanInputError)) throw error;
      arm.status = 'stuck';
      arm.result = clip(error.message, 300);
    }
    // Not saved (the request was stopped meanwhile, or the save failed): the plan just made must not
    // run on, or the arm would go out a second time on the next look.
    const saved = await saveRequest(deps.db, request).catch((error) => error);
    if (!saved || saved instanceof Error) {
      if (arm.status === 'handed') await deps.stopPlan({ id: arm.planId, ...scope }, deps.planDeps || {});
      if (saved instanceof Error) throw saved;
      return false;
    }
  }
  return true;
}

async function feedNow(scope, deps) {
  await deps.recoverOnce(deps.planDeps || {});
  for (const row of await listOpenRequests(deps.db, scope)) {
    const request = fromRow(row);
    const changed = await sync(request, scope, deps);
    if (changed) await saveRequest(deps.db, request);
    if (!await handOut(request, scope, deps)) continue;
    if (request.arms.every((arm) => FINAL_ARM.has(arm.status))) {
      request.status = 'done';
      await saveRequest(deps.db, request);
      log.info('kraken request finished', { requestId: request.id, arms: request.arms.length });
    }
  }
}

/** Catch the person's open requests up with their plans and hand out what there is room for. */
export function feed({ workspaceId, userId }, deps = {}) {
  const scope = { workspaceId, userId };
  return inLine(scope, () => feedNow(scope, { ...DEFAULT_DEPS, ...deps }));
}

/** Stop the person's request: arms not yet out never start, and the plans that are out stop. Null when it is not theirs. */
export function stopRequest({ id, workspaceId, userId }, deps = {}) {
  const all = { ...DEFAULT_DEPS, ...deps };
  const scope = { workspaceId, userId };
  return inLine(scope, async () => {
    const row = await getRequest(all.db, { id, ...scope });
    if (!row || row.status !== 'open') return row;
    const request = fromRow(row);
    await sync(request, scope, all);
    for (const arm of request.arms.filter((item) => !FINAL_ARM.has(item.status))) {
      // A plan that finished just before the stop keeps its own ending.
      const plan = arm.status === 'handed' ? await all.stopPlan({ id: arm.planId, ...scope }, all.planDeps || {}) : null;
      arm.status = plan && FINAL_PLAN.has(plan.status) ? plan.status : 'stopped';
      if (plan?.summary) arm.result = clip(plan.summary, 400);
    }
    request.status = 'stopped';
    log.info('kraken request stopped', { requestId: id });
    return (await saveRequest(all.db, request)) || getRequest(all.db, { id, ...scope });
  });
}

/** After a start: catch every open request up, so arms a restart left waiting go out with no window open. */
export async function feedEveryone(deps = {}) {
  const owners = await listOpenOwners(deps.db || pool);
  for (const owner of owners) {
    await feed(owner, deps).catch((error) => log.warn('arms not caught up after a start', { code: safeErrorCode(error) }));
  }
  return owners.length;
}

// When any plan of a person stops running there is room again, so their next arm goes out
// (nothing happens for someone with no request out).
onPlanSettled((planId) => {
  loadPlan(pool, planId)
    .then((plan) => plan && feed({ workspaceId: plan.workspace_id, userId: plan.user_id }))
    .catch((error) => log.warn('next arm not handed out', { planId, code: safeErrorCode(error) }));
});

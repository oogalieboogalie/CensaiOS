// A Kraken Request hands its arms to the family a few at a time. Each arm
// becomes one of Censai's plans (server/censaiOrchestrator), so the person sees
// it in Censai's chat like any other plan, with its steps and its checklist.
//
// At most KRAKEN_SLOTS of a person's plans come from a Kraken Request at once,
// which leaves room for something they ask Censai themselves. When one of its
// plans finishes, gets stuck or is stopped, the next waiting arm goes out
// (onPlanSettled), and looking at the request (the window, on a timer) does the
// same, so a restart never leaves arms waiting for ever.
//
// Every arm works in the request's pinned project (its plan carries the pin),
// and an arm that cannot go out right now is blocked, not downgraded (handOut.js).
// A request with a blocked arm stays open until the arm goes out or the person stops it.

import pool from '../db.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { checkPin } from '../censaiOrchestrator/projectPin.js';
import { FINAL_PLAN, clip } from '../censaiOrchestrator/shape.js';
import { countOpenPlans, getPlan, loadPlan } from '../censaiOrchestrator/store.js';
import { createPlan, onPlanSettled, recoverOnce, stopPlan } from '../censaiOrchestrator/runner.js';
import { handOffGap } from '../tools/handlers/censaiOrchestrator.js';
import { checkGithubAccess } from '../github/access.js';
import { folderRepos } from '../censaiOrchestrator/folderRepo.js';
import { planProject } from '../censaiOrchestrator/planProject.js';
import { workerBranchesOfPlan } from '../workspaces/workerBranches.js';
import { FINAL_ARM, notePr } from './arms.js';
import { KRAKEN_SLOTS, handOut } from './handOut.js';
import { getRequest, listOpenOwners, listOpenRequests, saveRequest } from './store.js';

const log = createLogger('kraken');
export { KRAKEN_SLOTS };

export const DEFAULT_DEPS = Object.freeze({
  db: pool, createPlan, stopPlan, getPlan, countOpenPlans, handOffGap, recoverOnce, checkPin,
  requireMember: requireWorkspaceMember, checkGithubAccess, folderRepos, planProject, workerBranchesOfPlan,
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

const fromRow = (row) => ({
  id: row.id, project: row.project, pin: row.pin || null, mode: row.mode, status: row.status, arms: structuredClone(row.arms || []),
});

/**
 * A fix on GitHub: its branch and its pull request, as noted for its plan's job, and how the
 * pull request's checks stand. The arm is done when its plan is, and its plan is done only once
 * the pull request is open and its checks passed. True when something changed.
 */
async function followPr(request, arm, plan, deps) {
  if (arm.kind !== 'code' || request.pin?.kind !== 'github') return false;
  try {
    return notePr(arm, await deps.workerBranchesOfPlan(deps.db, plan.id), plan);
  } catch (error) {
    log.warn('pull request of an arm not read', { requestId: request.id, arm: arm.n, code: safeErrorCode(error) });
    return false;
  }
}

/** Bring each arm that went out up to date with its plan. True when something changed. */
async function sync(request, scope, deps) {
  let changed = false;
  for (const arm of request.arms.filter((item) => item.status === 'handed' || item.status === 'handing')) {
    const plan = await deps.getPlan(deps.db, { id: arm.planId || arm.taskId, ...scope });
    if (arm.status === 'handing') {
      // Saved as going out, then cut off before its plan was known: the plan made under its
      // task id is its plan, and none means it never went out, so it waits its turn again.
      arm.status = plan ? 'handed' : 'waiting';
      arm.planId = plan ? plan.id : null;
      changed = true;
      if (!plan) continue;
    }
    if (plan && await followPr(request, arm, plan, deps)) changed = true;
    if (plan && !FINAL_PLAN.has(plan.status)) continue;
    arm.status = plan ? plan.status : 'stuck';
    arm.result = plan ? clip(plan.summary || '', 400) : 'Its plan could not be found.';
    changed = true;
  }
  return changed;
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

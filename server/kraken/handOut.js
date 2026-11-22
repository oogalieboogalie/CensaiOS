// Handing a Kraken Request's arms out, one plan each (feeder.js decides when).
//
// Before an arm goes out, these are checked again:
//   - the request's pinned project is still the one the person looked at
//     (checkPin, server/censaiOrchestrator/projectPin.js), for every arm;
//   - a fix could be checked off here for this person (handOffGap, the checks
//     Censai's chat runs before a hand-off);
//   - a fix can end in a pull request: on a project kept on GitHub, the key
//     the work will use can read the pinned commit, make a branch and open a
//     pull request (checkGithubAccess). A fix in a folder on this computer is
//     never written into that folder: it needs a GitHub copy (sourceGap).
// An arm that fails one is shown as blocked, with why (blocked.js). It keeps
// its kind, takes no room, and is checked again on the next look. When GitHub
// cannot tell up front whether the key may make a branch or a pull request,
// the fix goes out with a note saying it may still fail when it tries.
//
// Saved before it goes out: an arm is saved as "handing", with its task id,
// BEFORE its plan is made, and the plan is made under that task id. A crash
// between the two leaves an arm the next look puts right (sync in feeder.js):
// the plan with that task id is its plan, and none means it never went out.
// Making the plan again under the same id finds the first one, so no arm ever
// has two plans.

import { randomUUID } from 'node:crypto';
import { createLogger } from '../logger.js';
import { PlanInputError, clip, normalizePlanInput } from '../censaiOrchestrator/shape.js';
import { MAX_OPEN_PLANS } from '../censaiOrchestrator/store.js';
import { block, planInput, unblock } from './arms.js';
import { NOT_A_WORKER, accessWords, blockedWords, noGithubCopy } from './blocked.js';
import { saveRequest } from './store.js';
import { repoKey } from '../censaiOrchestrator/folderRepo.js';

const log = createLogger('kraken');
export const KRAKEN_SLOTS = Math.max(1, MAX_OPEN_PLANS - 1);
const WORKERS = ['owner', 'admin', 'member'];
const PR_NEEDS = Object.freeze(['read', 'branch', 'pull request']);

/** Why a fix could never be checked off here for this person ({ why, fix }), or null. */
async function fixGap(request, arm, input, scope, deps) {
  let member = null;
  try {
    member = await deps.requireMember(deps.db, { ...scope, roles: WORKERS });
  } catch (error) {
    if (error?.statusCode !== 403) throw error;
  }
  if (!member) return NOT_A_WORKER;
  const repo = request.pin?.kind === 'github' ? request.pin.source : null;
  const gap = await deps.handOffGap(input, scope, member, deps.db, deps.planDeps || {}, repo);
  return gap ? blockedWords(gap, arm, request.pin) : null;
}

/**
 * Where a fix's pull request would go, checked once a look: { gap } when it cannot go out,
 * { note } when it goes out but may still fail, or {} when nothing is in the way.
 * A request from before pins keeps the old way (no pull request).
 */
async function sourceGap(request, scope, deps) {
  const pin = request.pin;
  if (!pin) return {};
  if (pin.kind === 'folder') {
    // The folder is the person's own working copy: a fix is never written into it.
    const [repo = null] = [...await deps.folderRepos(pin.source, { keepCase: true })];
    // Its GitHub copy is open to this person here: the fix was set up before fixes went to GitHub.
    const github = repo ? await deps.planProject(deps.db, { ...scope, project: repo, keepGithub: true }) : null;
    const reachable = Boolean(github?.repo && repoKey(github.repo) === repoKey(repo));
    return { gap: noGithubCopy(pin, repo, { reachable }) };
  }
  const access = await deps.checkGithubAccess({
    repo: pin.source, ref: pin.commit || pin.branch || undefined, userId: scope.userId, needs: [...PR_NEEDS], computerKey: true,
  });
  if (access?.ok === true) return {};
  // 'unknown' is a string, so it is never taken for a yes: it goes out, saying it may still fail.
  if (access?.ok === 'unknown') return { note: clip(`It may still fail when it tries: ${access.reason}`, 300) };
  return { gap: accessWords(pin, access?.reason) };
}

/**
 * Hand out the arms that can go, while there is room. Saves as it goes.
 * False once the request is no longer open.
 */
export async function handOut(request, scope, deps) {
  const planDeps = deps.planDeps || {};
  const fixGaps = new Map(); // one check for each family member, each look
  let pinGap; // one check for the request, each look
  let source; // where a fix's pull request goes, one check each look
  let full = false;
  for (const arm of request.arms.filter((item) => item.status === 'waiting' || item.status === 'blocked')) {
    try {
      const input = normalizePlanInput(planInput(request, arm));
      if (pinGap === undefined) pinGap = request.pin ? await deps.checkPin(deps.db, scope, request.pin, planDeps) : null;
      // Where its pull request goes comes first: a fix with nowhere to open one never goes out, whoever has it.
      if (!pinGap && arm.kind === 'code' && source === undefined) source = await sourceGap(request, scope, deps);
      if (!pinGap && arm.kind === 'code' && !source.gap && !fixGaps.has(arm.agentId)) {
        fixGaps.set(arm.agentId, await fixGap(request, arm, input, scope, deps));
      }
      const gap = pinGap || (arm.kind === 'code' ? source.gap || fixGaps.get(arm.agentId) : null);
      if (gap) {
        if (arm.status === 'blocked' && arm.why === clip(gap.why, 300)) continue;
        block(arm, gap);
        log.info('arm blocked', { requestId: request.id, arm: arm.n, agentId: arm.agentId, kind: arm.kind });
      } else {
        full ||= await deps.countOpenPlans(deps.db, scope) >= KRAKEN_SLOTS;
        if (full && arm.status === 'waiting') continue;
        unblock(arm);
        if (!full) {
          arm.taskId ||= randomUUID(); // a request from before task ids
          arm.status = 'handing';
          arm.note = arm.kind === 'code' ? source?.note || '' : arm.note || '';
          if (!await saveRequest(deps.db, request)) return false;
          const plan = await deps.createPlan({ ...scope, ...input, id: arm.taskId, pin: request.pin || null }, planDeps);
          arm.status = 'handed';
          arm.planId = plan.id;
          log.info('arm handed out', { requestId: request.id, arm: arm.n, agentId: arm.agentId, planId: plan.id });
        }
      }
    } catch (error) {
      if (!(error instanceof PlanInputError)) throw error;
      arm.status = 'stuck';
      arm.result = clip(error.message, 300);
    }
    // Null: the request was stopped meanwhile, so a plan just made must not run on.
    if (!await saveRequest(deps.db, request)) {
      if (arm.status === 'handed') await deps.stopPlan({ id: arm.planId, ...scope }, planDeps);
      return false;
    }
  }
  return true;
}

// A Kraken Request's arms: one finding each, with who has it and the job they
// get. Pure, no database. An arm becomes one of Censai's plans with a single
// job (server/censaiOrchestrator), so one arm getting stuck never holds up the rest.
//
// Two ways to hand a report out:
//   writeup  each agent looks into its finding and writes what to change (the
//            default: nothing in the project changes)
//   fix      agents who can change project files fix their finding, and the
//            project's tests must pass; needs the project the work is in.
//            On a project kept on GitHub each fix works on a branch of its
//            own and ends in a pull request, whose checks on GitHub are its
//            tests (server/censaiOrchestrator/jobPr.js); the arm shows it.
//
// An arm's status: waiting (its turn has not come), handing (saved as going
// out, its plan not yet known), handed (its plan is running), blocked (it
// cannot go out right now, with why and what to try; checked again on every
// look), then done, stuck or stopped. A fix that cannot go out stays a fix:
// it is never turned into a write-up behind the person's back.

import { randomUUID } from 'node:crypto';
import { FILE_CHANGERS, HANDOFF_AGENTS, PR_WAITS, agentName, clip, handoffAgentId } from '../censaiOrchestrator/shape.js';

export const MODES = Object.freeze(['writeup', 'fix']);
export const FINAL_ARM = new Set(['done', 'stuck', 'stopped']);
const RANK_ORDER = { P0: 0, P1: 1, P2: 2 };
const FALLBACK_AGENT = 'architect';

// What each family member is for, as words a finding would use. The most hits wins;
// a tie goes to whoever comes first here.
const FITS = [
  ['nexus', /\b(databases?|postgres\w*|sql|migrations?|index(?:es)?|quer(?:y|ies)|tables?|schema|connection pool|rows?)\b/gi],
  ['foundation', /\b(docker\w*|compose|containers?|deploy\w*|ci|workflows?|builds?|infra\w*|dependenc(?:y|ies)|packages?|bundles?|install\w*|updater|disk|repo size)\b/gi],
  ['genesis', /\b(ui|ux|windows?|components?|css|react|front ?end|canvas|design|render\w*|accessib\w*|browser|localstorage)\b/gi],
  ['atlas', /\b(server|api|routes?|endpoints?|workers?|queues?|auth\w*|sessions?|timeouts?|back ?end|websockets?|security|tokens?|secrets?)\b/gi],
  ['phoenix', /\b(recover\w*|restarts?|crash\w*|backups?|restore|stuck|retry|retries|dead ?letter)\b/gi],
  ['echo', /\b(costs?|pricing|strategy|market\w*|customers?|scope|roadmap|business|focus)\b/gi],
  ['architect', /\b(architecture|structure|duplicat\w*|refactor\w*|sprawl|boundar(?:y|ies)|modules?|tech(?:nical)? debt|dead code|tests?)\b/gi],
];

/** Who a finding goes to: the owner the report names, else whoever its words fit best. */
export function pickAgent(finding) {
  const named = handoffAgentId(finding.owner);
  if (named) return named;
  const words = `${finding.title} ${finding.body}`;
  let best = FALLBACK_AGENT;
  let most = 0;
  for (const [agentId, fit] of FITS) {
    const hits = (words.match(fit) || []).length;
    if (hits > most && HANDOFF_AGENTS.includes(agentId)) {
      best = agentId;
      most = hits;
    }
  }
  return best;
}

const WRITEUP_LIST = [
  'The answer says whether the finding is true today and names the file it was seen in',
  'The answer lists the files to change and what to change in each',
  'The answer says how to prove the fix worked',
];
const FIX_LIST = ['The change the finding asks for is made, and the answer names the files that changed'];

function taskText(finding, kind) {
  const what = kind === 'code'
    ? 'Fix it. Keep the change as small as it can be, and add or update a test that proves it.'
    : 'Look into it in the project files and say whether it is true today. Then write up what is wrong, which files to change, what to change in each, in order, and how to prove it is fixed. Do not change any files.';
  return [
    `A review of this project found this (${finding.severity}): ${finding.title}`,
    finding.body,
    finding.files?.length ? `Files it names: ${finding.files.join(', ')}` : null,
    // A write-up cannot make these true, so they go along as the target, not as its checklist.
    kind !== 'code' && finding.doneWhen?.length ? `The fix counts as done when: ${finding.doneWhen.join('; ')}` : null,
    what,
  ].filter(Boolean).join('\n\n');
}

/** One arm from one finding. A fix needs a project and an agent who can change files; otherwise it is a write-up. */
export function buildArm(finding, { mode = 'writeup', project = null } = {}) {
  const agentId = pickAgent(finding);
  const kind = mode === 'fix' && project && FILE_CHANGERS.includes(agentId) ? 'code' : 'answer';
  const own = (finding.doneWhen || []).filter(Boolean);
  return {
    n: finding.n,
    severity: RANK_ORDER[finding.severity] === undefined ? 'P2' : finding.severity,
    title: clip(finding.title, 120),
    agentId,
    kind,
    detail: finding.body || '',
    files: finding.files || [],
    task: clip(taskText(finding, kind), 2000),
    doneWhen: own,
    checklist: kind === 'code' ? (own.length ? own : FIX_LIST) : WRITEUP_LIST,
    status: 'waiting',
    taskId: null,
    planId: null,
    why: '',
    fix: '',
    note: '',
    result: '',
    branch: null,
    pr: null,
  };
}

/** The arms of a report, worst first, then in the report's order. only: the finding numbers to keep. */
export function buildArms(findings, { mode, project, only } = {}) {
  const keep = Array.isArray(only) && only.length ? new Set(only.map(Number)) : null;
  return findings
    .filter((finding) => !keep || keep.has(finding.n))
    .map((finding) => buildArm(finding, { mode, project }))
    .sort((a, b) => RANK_ORDER[a.severity] - RANK_ORDER[b.severity] || a.n - b.n);
}

/**
 * Give every arm its task id, once, as the request is made. The id is the arm's for good:
 * its plan is made under it, so handing the same arm out again finds that plan (feeder.js).
 */
export function withTaskIds(arms, newId = randomUUID) {
  for (const arm of arms) arm.taskId ||= newId();
  return arms;
}

/** Censai's hand_off_jobs arguments for one arm. Its project is the request's pinned one, by id. */
export function planInput(request, arm) {
  return {
    goal: clip(`Kraken ${arm.severity}: ${arm.title}`, 300),
    project: request.pin?.projectId || request.project || undefined,
    // A fix on a project kept on GitHub works on a branch of its own and is tested by its pull request's checks.
    onGithub: request.pin?.kind === 'github',
    jobs: [{ agent: arm.agentId, job: arm.task, kind: arm.kind, checklist: arm.checklist }],
  };
}

/** The arm cannot go out right now: it keeps its kind, and says why and what to try. */
export function block(arm, { why, fix = '' }) {
  arm.status = 'blocked';
  arm.why = clip(why, 300);
  arm.fix = clip(fix, 300);
  return arm;
}

/** What was in the way is gone: the arm waits its turn again. */
export function unblock(arm) {
  arm.status = 'waiting';
  arm.why = '';
  arm.fix = '';
  return arm;
}

function publicArm(arm) {
  return {
    n: arm.n, severity: arm.severity, title: arm.title, agentId: arm.agentId, agent: agentName(arm.agentId),
    kind: arm.kind, status: arm.status, planId: arm.planId || null, note: arm.note || '', result: arm.result || '',
    why: arm.why || '', fix: arm.fix || '',
    checklist: (arm.checklist || []).map(String),
    branch: arm.branch || null,
    pr: publicPr(arm.pr),
  };
}

// How a fix's pull request's checks stand, as the window names them. none: no check ran on it (never "passed").
const PR_STATES = new Set(['passed', 'failed', 'running', 'unknown', 'waiting', 'none']);
const PR_CHECKS = { ticked: 'passed', checking: 'running', open: 'waiting' }; // a checklist state, from before
const TRY = ['first', 'second', 'third'];
const LAST_WORDS = { passed: 'passed', failed: 'failed', none: 'did not run', running: 'were still running', unreadable: 'could not be read' };

/** A fix's pull request as the browser sees it: its number, link, branch and how its checks stand. */
function publicPr(pr) {
  if (!pr?.number || !/^https:\/\//.test(String(pr.url || ''))) return null;
  return {
    number: Number(pr.number), url: String(pr.url), branch: pr.branch || null,
    checks: PR_STATES.has(pr.checks) ? pr.checks : PR_CHECKS[pr.checks] || 'waiting', line: pr.line || '',
  };
}

/**
 * Bring a fix arm's branch and pull request up to date: what was noted for its plan's job
 * (server/workspaces/workerBranches.js) and how the job's pull-request item stands. True when it changed.
 */
export function notePr(arm, rows = [], plan = null) {
  const row = (Array.isArray(rows) ? rows : []).find((entry) => entry.branch || entry.pr_number) || null;
  const job = plan?.jobs?.[0] || null;
  const item = (job?.checklist || []).find((entry) => entry?.how === 'pr') || null;
  const { checks, line } = checksNow(item, job);
  const before = JSON.stringify([arm.branch || null, arm.pr || null]);
  if (row?.branch) arm.branch = clip(row.branch, 200);
  if (row?.pr_number) {
    arm.pr = {
      number: Number(row.pr_number), url: clip(row.pr_url || '', 300), branch: row.branch || null,
      headSha: row.pr_head_sha || null, checks, line: clip(line, 300),
    };
  }
  return JSON.stringify([arm.branch || null, arm.pr || null]) !== before;
}

/**
 * How the pull request's checks stand for the arm: what this try read, or else the last thing
 * really known ("checks failed on the first try; the second try did not finish"), never a
 * bare "could not be read" for a try that never read them.
 */
function checksNow(item, job) {
  if (!item) return { checks: 'waiting', line: '' };
  if (item.state === 'ticked') return { checks: item.checks === 'none' ? 'none' : 'passed', line: item.line || '' };
  if (item.state === 'checking') return { checks: 'running', line: item.line || '' };
  if (item.state === 'failed' && item.line !== PR_WAITS) return { checks: 'failed', line: item.line || '' };
  const last = item.lastChecks;
  if (!last) return { checks: item.state === 'unknown' ? 'unknown' : 'waiting', line: item.state === 'unknown' ? item.line || '' : '' };
  const tries = Number(job?.attempts) || last.attempt;
  const ended = ['stuck', 'stopped', 'skipped'].includes(job?.status);
  const ord = (n) => TRY[n - 1] || `try ${n}`;
  let tail = 'then it stopped there.';
  if (tries > last.attempt) tail = ended ? `the ${ord(tries)} try did not finish.` : `the ${ord(tries)} try is under way.`;
  else if (job?.status === 'stopped') tail = 'then the work was stopped.';
  return {
    checks: ['passed', 'failed', 'none'].includes(last.state) ? last.state : 'unknown',
    line: `Checks ${LAST_WORDS[last.state] || 'were not read'} on the ${ord(last.attempt)} try; ${tail}`,
  };
}

/** A pin as the browser sees it (null for a request from before pins, or one with no project). */
export function publicPin(pin) {
  if (!pin?.projectId) return null;
  return {
    projectId: String(pin.projectId), name: pin.name || String(pin.projectId), kind: pin.kind === 'github' ? 'github' : 'folder',
    source: pin.source || '', branch: pin.branch || null, commit: pin.commit || null,
  };
}

/** A request row as the browser sees it. */
export function publicRequest(row) {
  if (!row) return null;
  const iso = (value) => (value ? new Date(value).toISOString() : null);
  const arms = (Array.isArray(row.arms) ? row.arms : []).map(publicArm);
  return {
    id: row.id, title: row.title, project: row.project || null, pin: publicPin(row.pin), mode: row.mode, status: row.status,
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), finishedAt: iso(row.finished_at),
    arms,
    counts: Object.fromEntries(['waiting', 'handing', 'handed', 'blocked', 'done', 'stuck', 'stopped'].map((s) => [s, arms.filter((arm) => arm.status === s).length])),
  };
}

export const previewArms = (arms) => arms.map(publicArm);

// A Kraken Request's arms: one finding each, with who has it and the job they
// get. Pure, no database. An arm becomes one of Censai's plans with a single
// job (server/censaiOrchestrator), so one arm getting stuck never holds up the rest.
//
// Two ways to hand a report out:
//   writeup  each agent looks into its finding and writes what to change (the
//            default: nothing in the project changes)
//   fix      agents who can change project files fix their finding, and the
//            project's tests must pass; needs the project the work is in

import { FILE_CHANGERS, HANDOFF_AGENTS, agentName, clip, handoffAgentId } from '../censaiOrchestrator/shape.js';

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
    planId: null,
    note: '',
    result: '',
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

/** Censai's hand_off_jobs arguments for one arm. */
export function planInput(request, arm) {
  return {
    goal: clip(`Kraken ${arm.severity}: ${arm.title}`, 300),
    project: request.project || undefined,
    jobs: [{ agent: arm.agentId, job: arm.task, kind: arm.kind, checklist: arm.checklist }],
  };
}

/** Turn a fix into a write-up, with the reason on the arm, when the fix could never be checked off here. */
export function asWriteup(arm, why) {
  arm.kind = 'answer';
  arm.task = clip(taskText({ severity: arm.severity, title: arm.title, body: arm.detail, files: arm.files, doneWhen: arm.doneWhen }, 'answer'), 2000);
  arm.checklist = WRITEUP_LIST;
  arm.note = clip(why, 300);
  return arm;
}

function publicArm(arm) {
  return {
    n: arm.n, severity: arm.severity, title: arm.title, agentId: arm.agentId, agent: agentName(arm.agentId),
    kind: arm.kind, status: arm.status, planId: arm.planId || null, note: arm.note || '', result: arm.result || '',
    checklist: (arm.checklist || []).map(String),
  };
}

/** A request row as the browser sees it. */
export function publicRequest(row) {
  if (!row) return null;
  const iso = (value) => (value ? new Date(value).toISOString() : null);
  const arms = (Array.isArray(row.arms) ? row.arms : []).map(publicArm);
  return {
    id: row.id, title: row.title, project: row.project || null, mode: row.mode, status: row.status,
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), finishedAt: iso(row.finished_at),
    arms,
    counts: Object.fromEntries(['waiting', 'handed', 'done', 'stuck', 'stopped'].map((s) => [s, arms.filter((arm) => arm.status === s).length])),
  };
}

export const previewArms = (arms) => arms.map(publicArm);

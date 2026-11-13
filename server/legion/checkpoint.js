// Legion: where a run is, saved as it works (state.json in its folder), so
// the app can pick it up after a restart (server/legion/resume.js) instead
// of losing it. The spec is kept as YAML and read back through the same
// checks as the person's own YAML, so a damaged file cannot slip anything in.
import { parseSpecYaml, specToYaml, withBuildOrder } from './spec.js';

export const STATE_FILE = 'state.json';
const KEEP_CHAT = 40;
const str = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

/** The loop's place as plain JSON: phase, round, plan, spec, every job's status. */
export function checkpointOf({ phase, round = 0, plan, spec, jobs = [], chat = [], verdict = null, committed = null }) {
  return {
    phase,
    round,
    plan: { summary: str(plan?.summary, 1200), answers: str(plan?.answers, 3000) },
    specYaml: spec ? specToYaml(spec) : null,
    jobs: jobs.map(({ id, status, attempt, note, fix }) => ({ id, status, attempt: attempt || 0, note: note || '', fix: fix || '' })),
    chat: chat.slice(-KEEP_CHAT),
    verdict: verdict ? { verdict: verdict.verdict, summary: str(verdict.summary, 1200), todo: Array.isArray(verdict.todo) ? verdict.todo : [] } : null,
    committed,
  };
}

/**
 * Where a saved run carries on, or null when it had no agreed spec yet
 * (then it plans again). Jobs that were cut off go back on the queue; done jobs stay
 * done. `step` is 'build' (the Work Queue), 'check' (the Validation Engine
 * at `round`), or 'end' (Echo had already given its last word).
 */
export function resumePoint(saved, maxFixRounds) {
  // Still planning: the plan was not agreed yet, so it starts again.
  if (!saved || saved.phase === 'plan') return null;
  const parsed = typeof saved.specYaml === 'string' ? parseSpecYaml(saved.specYaml) : {};
  if (!parsed.spec) return null;
  const spec = parsed.spec;
  const was = new Map((Array.isArray(saved.jobs) ? saved.jobs : []).map((job) => [job?.id, job || {}]));
  const jobs = withBuildOrder(spec.jobs).map((job) => {
    const old = was.get(job.id) || {};
    const fix = str(old.fix, 3000);
    return { ...job, status: old.status === 'done' ? 'done' : 'queued', attempt: Number(old.attempt) || 0, note: str(old.note, 300), ...(fix ? { fix } : {}) };
  });
  const savedRound = Math.min(Math.max(Number.parseInt(saved.round, 10) || 0, 0), maxFixRounds);
  const verdict = ['OK', 'NOK'].includes(saved.verdict?.verdict) ? saved.verdict : null;
  const plan = { summary: str(saved.plan?.summary, 1200) || spec.goal, answers: str(saved.plan?.answers, 3000), gameplan: {}, specs: {} };
  const chat = (Array.isArray(saved.chat) ? saved.chat : [])
    .filter((line) => typeof line?.role === 'string' && typeof line?.text === 'string').slice(-KEEP_CHAT);
  const base = { spec, plan, jobs, chat, verdict, committed: saved.committed?.committed ? saved.committed : null };
  if (['commit', 'reflect'].includes(saved.phase) && verdict) return { ...base, step: 'end', round: savedRound };
  if (saved.phase === 'check') return { ...base, step: 'check', round: savedRound };
  // A fix round that was cut off before its fixes were handed out checks the round before again.
  if (saved.phase === 'fix') {
    const handedOut = jobs.some((job) => job.status === 'queued' && job.fix);
    return { ...base, step: 'check', round: handedOut ? savedRound : Math.max(savedRound - 1, 0) };
  }
  return { ...base, step: 'build', round: 0 };
}

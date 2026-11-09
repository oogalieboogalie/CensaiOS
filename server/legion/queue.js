// Legion: the Work Queue from the Orchestrator Engine diagram. Every job
// has a UID; agents pull jobs whose dependencies are done, up to
// `concurrency` at a time. A job whose agent cannot answer (no key, the
// model is down, Stop) ends the queue once the jobs already running finish;
// a job that ran but did the wrong thing is caught later by the Validation
// Engine and sent back to the Orchestrator Engine by its UID.

export const QUEUE_CONCURRENCY = 3;

/** A copy of the queue for the window: [{ id, owner, task, status, attempt, note }]. */
export const snapshot = (jobs) => jobs.map(({ id, owner, task, status, attempt, note, dependsOn }) => ({
  id, owner, task: task.slice(0, 300), status, attempt, note: note || '', dependsOn,
}));

/**
 * Run every job whose status is 'queued'. `runJob(job)` does the work and
 * returns a short note; it may throw. Calls `onChange(jobs)` once per step
 * that changed a status: a job finishing and the jobs it frees starting are
 * one step, so the saved place (server/legion/checkpoint.js) never shows a
 * freed job still waiting. Resolves when nothing more can run.
 */
export async function runQueue({ jobs, runJob, onChange = () => {}, concurrency = QUEUE_CONCURRENCY, stopIfAsked = () => {} }) {
  const statusOf = (id) => jobs.find((j) => j.id === id)?.status;
  const ready = (job) => job.status === 'queued' && job.dependsOn.every((d) => statusOf(d) === 'done');
  const running = new Set();
  let firstError = null;

  const blockStuck = () => {
    let changed = false;
    for (const job of jobs) {
      if (job.status !== 'queued') continue;
      const dead = job.dependsOn.find((d) => ['failed', 'blocked'].includes(statusOf(d)));
      if (dead) { job.status = 'blocked'; job.note = `Waiting on ${dead}, which did not finish.`; changed = true; }
    }
    return changed;
  };

  return new Promise((resolve, reject) => {
    // `finished`: a job just ended, so its new status still has to be reported.
    const pump = (finished = false) => {
      let changed = finished;
      const report = () => { if (changed) onChange(jobs); };
      if (firstError) {
        if (!running.size) { changed = blockStuck() || changed; report(); reject(firstError); } else report();
        return;
      }
      try { stopIfAsked(); } catch (error) {
        firstError = error;
        report();
        if (!running.size) reject(error);
        return;
      }
      changed = blockStuck() || changed;
      for (const job of jobs) {
        if (running.size >= concurrency) break;
        if (!ready(job)) continue;
        job.status = 'working';
        job.attempt = (job.attempt || 0) + 1;
        running.add(job.id);
        changed = true;
        Promise.resolve()
          .then(() => runJob(job))
          .then((note) => { job.status = 'done'; job.note = String(note || '').slice(0, 300); })
          .catch((error) => {
            firstError = firstError || error;
            job.status = 'failed';
            job.note = String(error?.message || error).slice(0, 300);
          })
          .finally(() => { running.delete(job.id); pump(true); });
      }
      if (!running.size) {
        // Safety net: anything still queued now can never start.
        for (const job of jobs.filter((j) => j.status === 'queued')) {
          job.status = 'blocked'; job.note = 'Its dependencies can never finish.'; changed = true;
        }
      }
      report();
      if (!running.size) resolve(jobs);
    };
    pump();
  });
}

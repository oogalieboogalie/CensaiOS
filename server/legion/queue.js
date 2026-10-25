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
 * returns a short note; it may throw. Calls `onChange(jobs)` on every
 * status change. Resolves when nothing more can run.
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
    if (changed) onChange(jobs);
  };

  return new Promise((resolve, reject) => {
    const pump = () => {
      if (firstError) { if (!running.size) { blockStuck(); reject(firstError); } return; }
      try { stopIfAsked(); } catch (error) { firstError = error; if (!running.size) reject(error); return; }
      blockStuck();
      for (const job of jobs) {
        if (running.size >= concurrency) break;
        if (!ready(job)) continue;
        job.status = 'working';
        job.attempt = (job.attempt || 0) + 1;
        running.add(job.id);
        onChange(jobs);
        Promise.resolve()
          .then(() => runJob(job))
          .then((note) => { job.status = 'done'; job.note = String(note || '').slice(0, 300); })
          .catch((error) => {
            firstError = firstError || error;
            job.status = 'failed';
            job.note = String(error?.message || error).slice(0, 300);
          })
          .finally(() => { running.delete(job.id); onChange(jobs); pump(); });
      }
      if (!running.size) {
        // Safety net: anything still queued now can never start.
        const stuck = firstError ? [] : jobs.filter((j) => j.status === 'queued');
        for (const job of stuck) { job.status = 'blocked'; job.note = 'Its dependencies can never finish.'; }
        if (stuck.length) onChange(jobs);
        if (firstError) reject(firstError);
        else resolve(jobs);
      }
    };
    pump();
  });
}

/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { roleName } from '../../../lib/legion/legionState.js';

const STATUS = { queued: 'Queued', working: 'Working', done: 'Done', failed: 'Failed', blocked: 'Blocked' };

/** The Work Queue: every job by its UID, who owns it, and where it is. */
export function LegionQueue({ jobs = [] }) {
  if (!jobs.length) return null;
  const done = jobs.filter((j) => j.status === 'done').length;
  return (
    <section className="hb-legion-queue" aria-label="Work Queue">
      <span className="hb-legion-label">Work Queue · {done} of {jobs.length} done</span>
      <ul className="hb-legion-jobs">
        {jobs.map((job) => (
          <li key={job.id} className="hb-legion-job" data-role={job.owner} data-status={job.status} title={job.note || job.task}>
            <code className="hb-legion-uid">{job.id}</code>
            <span className="hb-legion-job-owner">{roleName(job.owner)}</span>
            <span className="hb-legion-job-task">{job.task}</span>
            <span className="hb-legion-pill" data-status={job.status}>{STATUS[job.status] || job.status}{job.attempt > 1 ? ` · try ${job.attempt}` : ''}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The Validation Engine's checks from the YAML, last round. */
export function LegionChecks({ checks }) {
  if (!checks?.results?.length) return null;
  const passed = checks.results.filter((r) => r.ok).length;
  return (
    <details className="hb-legion-card" open>
      <summary>Validation Engine · {passed} of {checks.results.length} checks pass</summary>
      <ul className="hb-legion-checks">
        {checks.results.map((r) => (
          <li key={r.id} data-ok={r.ok ? 'true' : 'false'}>
            <span aria-hidden="true">{r.ok ? '✓' : '✗'}</span> <code>{r.id}</code> <code>{r.job}</code> {r.detail}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The YAML spec the run works from. */
export function LegionSpec({ spec }) {
  if (!spec?.yaml) return null;
  return (
    <details className="hb-legion-card">
      <summary>Spec (legion.yaml{spec.from === 'person' ? ', yours' : ', written by the Orchestrator Engine'})</summary>
      <pre className="hb-legion-yaml">{spec.yaml}</pre>
    </details>
  );
}

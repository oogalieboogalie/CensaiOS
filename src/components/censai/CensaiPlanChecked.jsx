import { checkedOff, jobWord } from '../../lib/censai/plans.js';
import { CensaiChecklist } from './CensaiChecklist.jsx';

// The fold under a plan's result line: for each part, who did it, its
// checklist as Censai checked it off, what Censai saw of the work, and their
// own answer one more tap away.
export function CensaiPlanChecked({ plan }) {
  if (!plan?.jobs?.length) return null;
  return (
    <details className="hb-plan-checked">
      <summary>What I checked</summary>
      <ol className="hb-plan-jobs">
        {plan.jobs.map((job) => (
          <li key={job.n} className="hb-plan-job" data-status={job.status}>
            <div className="hb-plan-who">
              <span className="hb-plan-name">{job.agent}</span>
              <span className="hb-plan-word">{jobWord(job.status)}</span>
              {job.checklist?.length > 0 && <span className="hb-plan-count">{checkedOff(job)}</span>}
            </div>
            <p className="hb-plan-title">{job.title}</p>
            <CensaiChecklist items={job.checklist || []} />
            {job.error && job.stuckOn == null && <p className="hb-plan-why">{job.error}</p>}
            {job.seen?.length > 0 && (
              <ul className="hb-plan-seen" aria-label={`What I saw of ${job.agent}'s work`}>
                {job.seen.map((line, i) => <li key={`${i}-${line}`}>{line}</li>)}
              </ul>
            )}
            {job.answer && (
              <details className="hb-plan-more">
                <summary>What {job.agent} said</summary>
                <p className="hb-plan-answer">{job.answer}</p>
              </details>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}

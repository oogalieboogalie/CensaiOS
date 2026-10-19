import React from 'react';
import { AgentAvatar } from '../Agents.jsx';
import { checkedOff, jobWord, planWord, showChecklist, stepMark, visibleSteps } from '../../lib/censai/plans.js';
import { CensaiChecklist } from './CensaiChecklist.jsx';

// A plan Censai handed out, live in the pinned chat while it runs: who has
// each part, every stage as one plain line (handed over, working, answered,
// checking), and the checklist of the part at work as Censai checks it off,
// so nothing is ever just a spinner.
export function CensaiPlanCard({ plan, agents = [], onStop, stopping = false }) {
  const byId = React.useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  return (
    <section className="hb-plan" data-status={plan.status} data-testid="censai-plan" aria-label={`Plan: ${plan.goal}`}>
      <header className="hb-plan-head">
        <span className="hb-plan-tag">Plan</span>
        <span className="hb-plan-state">{planWord(plan.status)}</span>
        {onStop && (
          <button type="button" className="hb-plan-stop" onClick={() => onStop(plan.id)} disabled={stopping} aria-label={`Stop the plan: ${plan.goal}`}>
            {stopping ? 'Stopping…' : 'Stop'}
          </button>
        )}
      </header>
      <p className="hb-plan-goal">{plan.goal}</p>
      <ol className="hb-plan-jobs">
        {plan.jobs.map((job) => (
          <li key={job.n} className="hb-plan-job" data-status={job.status}>
            <div className="hb-plan-who">
              <AgentAvatar agent={byId.get(job.agentId) || { id: job.agentId, name: job.agent, role: 'Family' }} size={20} />
              <span className="hb-plan-name">{job.agent}</span>
              <span className="hb-plan-word">{jobWord(job.status)}</span>
              {job.checklist?.length > 0 && <span className="hb-plan-count">{checkedOff(job)}</span>}
            </div>
            <p className="hb-plan-title">{job.title}</p>
            {visibleSteps(job).length > 0 && (
              <ul className="hb-plan-steps">
                {visibleSteps(job).map((step, i) => (
                  <li key={`${step.at}-${i}`} data-state={step.state}>
                    <span className="hb-plan-mark" aria-hidden="true">{stepMark(step.state)}</span>
                    <span className="hb-plan-step-text">{step.text}</span>
                  </li>
                ))}
              </ul>
            )}
            {showChecklist(job) && <CensaiChecklist items={job.checklist || []} />}
          </li>
        ))}
      </ol>
    </section>
  );
}

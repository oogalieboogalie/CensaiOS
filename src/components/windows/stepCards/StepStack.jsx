import React from 'react';
import { cardFinished, stepPosition, stepsLeft, topStep } from '../../../lib/stepCards/stack.js';
import { assigneeWords } from './AssignChip.jsx';

const LOCKED_SHOWN = 3;
const LEAVE_MS = 1500;

const DOT_WORDS = { open: 'Not checked yet', checking: 'Checking now', passed: 'Checked and true', failed: 'Checked, not true yet', unknown: 'Could not be checked' };
const KIND_WORDS = { file: 'File', run: 'Run', ask: 'Censai reads' };

function LockMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function Dot({ state }) {
  return <span className="hb-sc-dot" data-state={state} role="img" aria-label={DOT_WORDS[state] || DOT_WORDS.open} title={DOT_WORDS[state] || DOT_WORDS.open} />;
}

function CheckRow({ check }) {
  return (
    <li className="hb-sc-check" data-state={check.state}>
      <Dot state={check.state} />
      <div className="hb-sc-check-body">
        <div className="hb-sc-check-words"><span className="hb-sc-kind">{KIND_WORDS[check.kind]}</span>{check.words}</div>
        {check.line && <div className="hb-sc-check-line">{check.line}</div>}
      </div>
    </li>
  );
}

function TopTab({ card, step, sc, leaving }) {
  const checking = step.checks.some((c) => c.state === 'checking');
  const green = step.checks.filter((c) => c.state === 'passed').length;
  const who = assigneeWords(card);
  const [report, setReport] = React.useState(step.report || '');
  React.useEffect(() => setReport(step.report || ''), [step.id, step.report]);
  return (
    <section className="hb-sc-tab hb-sc-top" data-leaving={leaving || undefined} aria-label={`${stepPosition(card, step)}, open`}>
      <div className="hb-sc-tab-head">
        <span className="hb-sc-pos">{stepPosition(card, step)}</span>
        <span className="hb-sc-dots" aria-label={`${green} of ${step.checks.length} checks green`}>
          {step.checks.map((c) => <Dot key={c.id} state={c.state} />)}
        </span>
      </div>
      <h3 className="hb-sc-step-title">{step.title}</h3>
      {step.text && <p className="hb-sc-step-text">{step.text}</p>}
      <ul className="hb-sc-checks">{step.checks.map((c) => <CheckRow key={c.id} check={c} />)}</ul>
      {step.sentNote && <div className="hb-sc-sent" role="status">{step.sentNote}</div>}
      {!leaving && (
        <>
          {step.checks.some((c) => c.kind === 'ask') && (
            <label className="hb-sc-report">
              <span>What the helper said they did (Censai reads it against the checks)</span>
              <textarea rows={3} value={report} placeholder={card.cliTaskId ? 'Left empty, Censai reads what the coding agent said.' : 'Paste their answer here.'}
                onChange={(e) => setReport(e.target.value)} onBlur={() => report !== (step.report || '') && sc.setReport(card.id, step.id, report)} />
            </label>
          )}
          <div className="hb-sc-actions">
            <button type="button" className="hb-sc-btn" disabled={Boolean(sc.busy) || checking} onClick={() => sc.send(card, step)}
              title={who ? `Send this step to ${who}` : 'Pick who does this card first'}>
              {sc.busy === 'sending' ? 'Sending…' : who ? `Send to ${who}` : 'Send to…'}
            </button>
            <button type="button" className="hb-sc-btn" data-primary="true" disabled={checking}
              onClick={() => { if (report !== (step.report || '')) sc.setReport(card.id, step.id, report); sc.check(card, { ...step, report }); }}>
              {checking ? 'Checking…' : 'Check this step'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * One card's steps as a stack of tabs: the top one open, the ones under it
 * locked, finished ones gone. A finished top tab slides away before the next
 * one opens.
 */
export function StepStack({ card, sc }) {
  const top = topStep(card);
  const [leaving, setLeaving] = React.useState(null);
  const lastTop = React.useRef(top?.id || null);
  const steps = React.useRef(card.steps);
  steps.current = card.steps;
  React.useEffect(() => {
    const previous = lastTop.current ? steps.current.find((s) => s.id === lastTop.current) : null;
    lastTop.current = top?.id || null;
    if (!previous?.done) return undefined;
    setLeaving(previous);
    const timer = setTimeout(() => setLeaving(null), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [top?.id]);

  const finished = card.steps.length - stepsLeft(card).length;
  const locked = stepsLeft(card).slice(1);
  return (
    <div className="hb-sc-stack-wrap">
      <div className="hb-sc-progress" aria-label={`${finished} of ${card.steps.length} steps finished`}>
        {card.steps.map((s) => <span key={s.id} className="hb-sc-pip" data-done={s.done || undefined} data-top={s.id === top?.id || undefined} />)}
        <span>{finished} of {card.steps.length} steps finished</span>
      </div>
      <div className="hb-sc-stack">
        {leaving && <TopTab card={card} step={leaving} sc={sc} leaving />}
        {!leaving && top && <TopTab key={top.id} card={card} step={top} sc={sc} />}
        {!leaving && cardFinished(card) && (
          <section className="hb-sc-tab hb-sc-top hb-sc-finished" aria-label="Card finished">
            <h3 className="hb-sc-step-title">Every step is checked off</h3>
            <p className="hb-sc-step-text">All {card.steps.length} steps passed their checks. Nothing on this card is left to do.</p>
          </section>
        )}
        {locked.slice(0, LOCKED_SHOWN).map((step, index) => (
          <div key={step.id} className="hb-sc-tab hb-sc-locked" style={{ '--depth': index + 1 }} aria-label={`${stepPosition(card, step)}, locked`}>
            <LockMark />
            <span className="hb-sc-pos">{stepPosition(card, step)}</span>
            <span className="hb-sc-locked-title">{step.title}</span>
            <span className="hb-sc-dots">{step.checks.map((c) => <Dot key={c.id} state="open" />)}</span>
          </div>
        ))}
        {locked.length > LOCKED_SHOWN && <div className="hb-sc-more">{locked.length - LOCKED_SHOWN} more locked under these</div>}
      </div>
    </div>
  );
}

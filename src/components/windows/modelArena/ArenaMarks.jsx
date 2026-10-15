/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { formatCost } from '../../../lib/modelArena/arenaCatalog.js';
import { estimateLaneCost } from '../../../lib/modelArena/benchmarkTasks.js';

/** Before a race: what one run should cost on each model, from list prices. */
export function CostEstimate({ lanes, prompt, system, labelOf }) {
  if (!prompt.trim()) return null;
  const parts = lanes.map((lane) => {
    const cost = estimateLaneCost(lane, prompt, system);
    return `${labelOf(lane)} ${cost === null ? 'no price on file' : `about ${formatCost(cost)}`}`;
  });
  return <p className="hb-arena-hint" aria-label="Cost estimate">Before you race: {parts.join(' · ')}</p>;
}

/** Under each finished answer: pick it as best, mark it right or wrong. */
export function LaneMarks({ index, rec, done, cutOff = false }) {
  if (!rec.finished || !done) return null;
  if (cutOff) return <p className="hb-arena-hint">Cut off, so it cannot count as right.</p>;
  const { marks } = rec;
  const mark = marks.lanes[index];
  const judged = marks.judge?.best === index;
  return (
    <div className="hb-arena-marks" role="group" aria-label={`Marks for model ${index + 1}`}>
      <button type="button" className="hb-arena-chip" aria-pressed={marks.best === index} onClick={() => rec.pickBest(index)}
        title="Your pick for the best answer in this race">Best answer</button>
      <button type="button" className="hb-arena-chip" aria-pressed={mark === 'right'} onClick={() => rec.markLane(index, 'right')}
        title="This answer is correct">Right</button>
      <button type="button" className="hb-arena-chip" data-tone="danger" aria-pressed={mark === 'wrong'} onClick={() => rec.markLane(index, 'wrong')}
        title="This answer is wrong">Wrong</button>
      {judged && <span className="hb-arena-badge" title={rec.marks.judge.reason || ''}>Judge's pick</span>}
    </div>
  );
}

/**
 * After a race: "Record this run" saves it to the Benchmarks window on the
 * board. The judge is off until the person picks a model for it.
 */
export function RecordBar({ rec, models }) {
  if (!rec.finished) return null;
  return (
    <>
    <p className="hb-arena-hint hb-arena-check">
      {rec.task
        ? <><strong>{rec.task.label}</strong> ({rec.task.kind}). A right answer: {rec.task.check}</>
        : 'Your own request: you can record it as a note, but only the benchmark tasks count in the rankings.'}
    </p>
    <div className="hb-arena-row hb-arena-record">
      <span className="hb-arena-label">Judge</span>
      <select className="hb-arena-select hb-arena-judge" aria-label="Judge model" value={rec.judge} onChange={(e) => rec.setJudge(e.target.value)}>
        <option value="">Off (you judge)</option>
        {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
      {rec.judge && (
        <button type="button" className="hb-btn" disabled={rec.judging} onClick={rec.askJudge}
          title="One more model reads the answers, names hidden, and picks the best. Uses your own key.">
          {rec.judging ? 'Judging…' : 'Ask the judge'}
        </button>
      )}
      <span className="hb-arena-spacer" />
      {rec.recorded ? (
        <span className="hb-arena-hint"><Icon.Check size={10} /> Recorded. Marks you change now update the record.</span>
      ) : (
        <button type="button" className="hb-btn" data-primary="true" onClick={rec.record}
          title="Save this race, its numbers and your marks to the Benchmarks window on this board">
          <Icon.History size={12} /> Record this run
        </button>
      )}
      {rec.judgeError && <p className="hb-arena-error" role="alert">{rec.judgeError}</p>}
    </div>
    </>
  );
}

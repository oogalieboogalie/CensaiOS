/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { MessageBody } from '../../chat/MessageBody.jsx';
import { formatCost, formatMs } from '../../../lib/modelArena/arenaCatalog.js';
import { taskById } from '../../../lib/modelArena/benchmarkTasks.js';
import { cleanMarks } from '../../../lib/modelArena/benchmarks.js';

const when = (at) => {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

/**
 * One recorded run: the request, each model's numbers and marks, and its
 * answer on demand. Anyone on the board can change the marks.
 */
export function RunCard({ run, labelOf, onMarks, onRemove }) {
  const [open, setOpen] = React.useState(false);
  const lanes = Array.isArray(run.lanes) ? run.lanes : [];
  const marks = cleanMarks(run.marks, lanes.length);
  const task = taskById(run.task);
  const idLabel = (id) => labelOf(id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1));
  const pickBest = (i) => onMarks({ ...marks, best: marks.best === i ? null : i });
  const markLane = (i, value) => {
    const next = { ...marks.lanes };
    if (next[i] === value) delete next[i];
    else next[i] = value;
    onMarks({ ...marks, lanes: next });
  };

  return (
    <article className="hb-bench-run" aria-label={`Run from ${when(run.at)}`}>
      <header className="hb-arena-row">
        <span className="hb-arena-label">{when(run.at)} · {task ? task.label : 'Your own request, not ranked'}</span>
        <span className="hb-arena-spacer" />
        <button type="button" className="hb-btn" data-variant="ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide answers' : 'Show answers'}
        </button>
        <button type="button" className="hb-btn" data-variant="ghost" aria-label="Delete this run" title="Delete this run" onClick={onRemove}>
          <Icon.Close size={10} />
        </button>
      </header>
      <p className="hb-bench-prompt">{run.prompt}</p>
      {open && task && <p className="hb-arena-hint">A right answer: {task.check}</p>}
      {marks.judge && (
        <p className="hb-arena-hint">Judge ({idLabel(marks.judge.model)}) picked {labelOf(lanes[marks.judge.best]?.provider, lanes[marks.judge.best]?.model)}{marks.judge.reason ? `: ${marks.judge.reason}` : ''}</p>
      )}
      <div className="hb-bench-lanes">
        {lanes.map((lane, i) => (
          <section key={`${i}-${lane.model}`} className="hb-bench-lane" data-best={marks.best === i}>
            <div className="hb-bench-model">{labelOf(lane.provider, lane.model)}</div>
            <div className="hb-arena-hint">
              {lane.status === 'error' ? 'Did not answer' : `${formatMs(lane.firstTokenMs)} first word · ${lane.cutOff ? 'cut off at the limit' : `${formatMs(lane.totalMs)} total`} · ${lane.usage ? formatCost(lane.cost) : '—'}`}
            </div>
            <div className="hb-arena-marks">
              <button type="button" className="hb-arena-chip" aria-pressed={marks.best === i} onClick={() => pickBest(i)}>Best answer</button>
              <button type="button" className="hb-arena-chip" aria-pressed={marks.lanes[i] === 'right'} onClick={() => markLane(i, 'right')}>Right</button>
              <button type="button" className="hb-arena-chip" data-tone="danger" aria-pressed={marks.lanes[i] === 'wrong'} onClick={() => markLane(i, 'wrong')}>Wrong</button>
            </div>
            {open && (
              <div className="hb-arena-reply">
                {lane.error ? <p className="hb-arena-error">{lane.error}</p> : <MessageBody text={lane.text || ''} />}
              </div>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}

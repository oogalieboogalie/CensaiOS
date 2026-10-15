/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { arenaModels } from '../../../lib/modelArena/arenaCatalog.js';
import { isRanked, leaders, modelTable, removeRecord, updateRecordMarks } from '../../../lib/modelArena/benchmarks.js';
import { BENCHMARK_TASKS } from '../../../lib/modelArena/benchmarkTasks.js';
import { ModelTable } from './ModelTable.jsx';
import { RunCard } from './RunCard.jsx';
import { windowMeta } from './meta.js';

export { windowMeta };

/**
 * Benchmarks: every Model arena race someone pressed "Record this run" on,
 * and a table per model across all of them. The records live on this board
 * (teammates see them live) and are never sent anywhere else.
 */
export function ArenaBenchmarksWindow({ win = {}, onUpdate, onSpawn }) {
  const runs = Array.isArray(win.runs) ? win.runs : [];
  const [view, setView] = React.useState(win.view === 'runs' ? 'runs' : 'models');
  const labels = React.useMemo(() => Object.fromEntries(arenaModels().map((m) => [m.id, m.label])), []);
  const [task, setTask] = React.useState('');
  const ranked = runs.filter(isRanked).length;
  const table = React.useMemo(() => modelTable(runs, { task: task || null }), [runs, task]);
  const ahead = React.useMemo(() => leaders(table), [table]);
  const labelOf = (provider, model) => labels[`${provider}:${model}`] || model;
  const show = (next) => { setView(next); onUpdate?.({ view: next }); };
  const setMarks = (id, marks) => onUpdate?.({ runs: updateRecordMarks(runs, id, marks) });
  const remove = (id) => onUpdate?.({ runs: removeRecord(runs, id) });
  const subtitle = `${runs.length} recorded ${runs.length === 1 ? 'run' : 'runs'}`;

  return (
    <>
      <WindowTitle icon={<Icon.History size={12} />} label={win.title || windowMeta.label} subtitle={subtitle} />
      <div className="hb-bench">
        {runs.length === 0 ? (
          <div className="hb-bench-empty">
            <p>No runs recorded yet.</p>
            <p className="hb-arena-hint">A benchmark built from your own real tasks, not a lab test. Race models in the Model arena, mark the best answer, then press Record this run. It shows up here for everyone on this board.</p>
            {onSpawn && (
              <button type="button" className="hb-btn" data-primary="true" onClick={() => onSpawn('modelArena')}>
                <Icon.Activity size={12} /> Open the Model arena
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="hb-arena-row" role="tablist" aria-label="Benchmark views">
              <button type="button" role="tab" className="hb-arena-chip" aria-selected={view === 'models'} aria-pressed={view === 'models'} onClick={() => show('models')}>Models</button>
              <button type="button" role="tab" className="hb-arena-chip" aria-selected={view === 'runs'} aria-pressed={view === 'runs'} onClick={() => show('runs')}>Runs</button>
            </div>
            {view === 'models' ? (
              <>
                <div className="hb-arena-row">
                  <select className="hb-arena-select hb-arena-judge" aria-label="Which task" value={task} onChange={(e) => setTask(e.target.value)}>
                    <option value="">All benchmark tasks</option>
                    {BENCHMARK_TASKS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  <span className="hb-arena-hint">
                    Ranked by how fast each model finishes while staying right. {ranked} of {runs.length} runs are benchmark tasks; your own requests are kept under Runs, not ranked.
                  </span>
                </div>
                {table.length ? <ModelTable table={table} ahead={ahead} labelOf={labelOf} />
                  : <p className="hb-arena-hint">No benchmark task runs recorded{task ? ' for this task' : ''} yet. Pick one of the Benchmark tasks in the Model arena.</p>}
              </>
            ) : (
              <div className="hb-bench-runs">
                {runs.map((run) => (
                  <RunCard key={run.id} run={run} labelOf={labelOf} onMarks={(marks) => setMarks(run.id, marks)} onRemove={() => remove(run.id)} />
                ))}
              </div>
            )}
          </>
        )}
        <p className="hb-arena-foot">Saved on this board only. Nothing here is sent anywhere. Costs are estimates from list prices.</p>
      </div>
    </>
  );
}

export default ArenaBenchmarksWindow;

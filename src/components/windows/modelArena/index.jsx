/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { ArenaLane, ModelPicker } from './ArenaLane.jsx';
import { useArena } from './useArena.js';
import { useArenaRecord } from './useArenaRecord.js';
import { CostEstimate, LaneMarks, RecordBar } from './ArenaMarks.jsx';
import { ADD_SUGGESTIONS, arenaModels, CUT_OFF_REASONS, laneBadges, MAX_LANES } from '../../../lib/modelArena/arenaCatalog.js';
import { BENCHMARK_TASKS } from '../../../lib/modelArena/benchmarkTasks.js';
import { windowMeta } from './meta.js';

export { windowMeta };

const toLane = (id) => {
  const at = id.indexOf(':');
  return { provider: id.slice(0, at), model: id.slice(at + 1) };
};

/**
 * Model arena: one request goes to up to four models at once, and their
 * replies stream in side by side with time to first word, total time,
 * tokens and estimated cost. Built to race fast "scout" models (the eyes
 * and ears of a bigger agent) against each other on real sub-agent jobs.
 */
export function ModelArenaWindow({ win = {}, onUpdate }) {
  const arena = useArena(win, onUpdate);
  const rec = useArenaRecord(win, onUpdate, { running: arena.running });
  const models = React.useMemo(() => arenaModels(), []);
  const [showSystem, setShowSystem] = React.useState(Boolean(arena.system));
  const { lanes, results, running } = arena;
  const badges = laneBadges(lanes, results);
  const pick = (index, id) => arena.setLanes(lanes.map((lane, i) => (i === index ? toLane(id) : lane)));
  const remove = (index) => arena.setLanes(lanes.filter((_, i) => i !== index));
  const add = (id) => arena.setLanes([...lanes, toLane(id)]);
  const racing = new Set(lanes.map((l) => `${l.provider}:${l.model}`));
  const nextSuggestion = [...ADD_SUGGESTIONS, ...models.map((m) => m.id)].find((id) => !racing.has(id));
  const send = (e) => { e?.preventDefault?.(); arena.run(); };
  const subtitle = lanes.map((l) => l.model).join(' vs ');
  const labelOf = (lane) => models.find((m) => m.id === `${lane.provider}:${lane.model}`)?.label || lane.model;

  return (
    <>
      <WindowTitle icon={<Icon.Activity size={12} />} label={win.title || windowMeta.label} subtitle={subtitle} />
      <div className="hb-arena" style={{ '--arena-cols': lanes.length + (lanes.length < MAX_LANES ? 1 : 0) }}>
        <form className="hb-arena-composer" onSubmit={send}>
          <textarea className="hb-arena-input" rows={3} value={arena.prompt} aria-label="Request to send to every model"
            placeholder="One request, sent to every model at once. Try a benchmark task below."
            onChange={(e) => arena.setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(e); }} />
          {showSystem && (
            <textarea className="hb-arena-input" rows={2} value={arena.system} aria-label="Instructions for every model"
              placeholder="Instructions every model gets first (optional)" onChange={(e) => arena.setSystem(e.target.value)} />
          )}
          <div className="hb-arena-row">
            <span className="hb-arena-label" title="Premade tasks: every model gets the same job, so these runs count in Benchmarks">Benchmark tasks</span>
            {BENCHMARK_TASKS.map((task) => (
              <button key={task.id} type="button" className="hb-arena-chip" disabled={running} onClick={() => { arena.pickSample(task); setShowSystem(true); }}>{task.label}</button>
            ))}
            <span className="hb-arena-spacer" />
            <button type="button" className="hb-btn" data-variant="ghost" onClick={() => setShowSystem((v) => !v)}>
              {showSystem ? 'Hide instructions' : 'Add instructions'}
            </button>
            {running ? (
              <button type="button" className="hb-btn" onClick={arena.stop}><Icon.Stop size={12} /> Stop</button>
            ) : (
              <button type="submit" className="hb-btn" data-primary="true" disabled={!arena.prompt.trim() || !lanes.length}
                title="Send to every model (Ctrl+Enter)"><Icon.Play size={12} /> Race</button>
            )}
          </div>
          {!running && !rec.finished && <CostEstimate lanes={lanes} prompt={arena.prompt} system={arena.system} labelOf={labelOf} />}
          {arena.error && <p className="hb-arena-error" role="alert">{arena.error}</p>}
          <RecordBar rec={rec} models={models} />
        </form>
        <div className="hb-arena-lanes">
          {lanes.map((lane, index) => (
            <ArenaLane key={`${index}-${lane.provider}:${lane.model}`} index={index} lane={lane} result={results[index]}
              badges={badges[index]} models={models} running={running}
              onPick={(id) => pick(index, id)} onRemove={lanes.length > 1 ? () => remove(index) : null}>
              <LaneMarks index={index} rec={rec} done={results[index]?.status === 'done'} cutOff={CUT_OFF_REASONS.has(results[index]?.finishReason)} />
            </ArenaLane>
          ))}
          {lanes.length < MAX_LANES && (
            <section className="hb-arena-lane hb-arena-add" aria-label="Add a model">
              <p className="hb-arena-hint">Race up to {MAX_LANES} models. Pick one to add:</p>
              <ModelPicker label="Add a model" value={nextSuggestion || ''} models={models} onChange={add} disabled={running} />
              <button type="button" className="hb-btn" disabled={running || !nextSuggestion} onClick={() => add(nextSuggestion)}>
                <Icon.Plus size={12} /> Add
              </button>
            </section>
          )}
        </div>
        <p className="hb-arena-foot">Each model runs on your own saved key (Settings, Vault). Costs are estimates from list prices.</p>
      </div>
    </>
  );
}

export default ModelArenaWindow;

/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { ModelPicker } from '../modelArena/ArenaLane.jsx';
import { arenaModels } from '../../../lib/modelArena/arenaCatalog.js';
import { LEGION_ROLES, legionApi } from '../../../lib/legion/legionState.js';

const DEFAULT_MODEL = 'anthropic:claude-sonnet-5-5';
const toSpec = (id) => ({ provider: id.slice(0, id.indexOf(':')), model: id.slice(id.indexOf(':') + 1) });

const SPEC_EXAMPLE = `goal: A one-page tip calculator with a total and a split
jobs:
  - id: J-001
    owner: nexus
    task: data/presets.js that sets window.TIP_PRESETS = [15, 18, 20]
  - id: J-002
    owner: genesis
    task: index.html, style.css and app.js with bill, presets, tip, total and split
checks:
  - id: C-001
    job: J-002
    file_exists: index.html
  - id: C-002
    job: J-002
    page_contains: Total
  - id: C-003
    job: J-002
    no_script_errors: true
`;

const SAMPLES = [
  'A one-page tip calculator: type the bill, pick 15, 18 or 20 percent, see the tip and the total.',
  'A landing page for Iowa AI LLC with a hero, three services and a contact form.',
  'A to-do list with a small backend and a database table for the tasks.',
];

function PastRuns({ onOpen }) {
  const [runs, setRuns] = React.useState([]);
  React.useEffect(() => { legionApi.list().then((d) => setRuns(d.runs || [])).catch(() => setRuns([])); }, []);
  if (!runs.length) return null;
  return (
    <section className="hb-legion-past" aria-label="Earlier Legions">
      <span className="hb-legion-label">Earlier Legions</span>
      {runs.slice(0, 6).map((r) => (
        <button key={r.id} type="button" className="hb-legion-past-row" onClick={() => onOpen(r.id)}>
          <span className="hb-legion-past-goal">{r.goal}</span>
          <span className="hb-legion-pill" data-status={r.status}>{r.verdict === 'OK' ? 'OK' : r.status}</span>
        </button>
      ))}
    </section>
  );
}

/** Where a Legion starts: the goal, the models, and earlier runs. */
export function LegionSetup({ win = {}, onUpdate, onStart, error, onOpen }) {
  const models = React.useMemo(() => arenaModels(), []);
  const [goal, setGoal] = React.useState(win.legionGoal || '');
  const [ask, setAsk] = React.useState(win.legionAsk !== false);
  const [educate, setEducate] = React.useState(win.legionSelfEducate !== false);
  const [perRole, setPerRole] = React.useState(Boolean(win.legionPerRole));
  const [busy, setBusy] = React.useState(false);
  const [specYaml, setSpecYaml] = React.useState(win.legionSpecYaml || '');
  const [showSpec, setShowSpec] = React.useState(Boolean(win.legionSpecYaml));
  const everyone = win.legionModel || DEFAULT_MODEL;
  const picks = win.legionModels || {};
  const save = (patch) => onUpdate?.(patch);

  const submit = async (e) => {
    e?.preventDefault?.();
    if ((!goal.trim() && !specYaml.trim()) || busy) return;
    setBusy(true);
    const perRoleModels = perRole ? Object.fromEntries(LEGION_ROLES.map((r) => [r.id, toSpec(picks[r.id] || everyone)])) : undefined;
    save({ legionGoal: goal, legionAsk: ask, legionSelfEducate: educate, legionSpecYaml: specYaml });
    await onStart({ goal, model: toSpec(everyone), models: perRoleModels, askQuestions: ask, selfEducate: educate, specYaml: showSpec ? specYaml : '' });
    setBusy(false);
  };

  return (
    <form className="hb-legion-setup" onSubmit={submit}>
      <p className="hb-legion-lede">Not swarms. Legions. Say what to build and the team keeps working until Echo says OK: plan, build in order, check in a browser, fix, commit.</p>
      <textarea className="hb-legion-input" rows={4} value={goal} aria-label="What should the Legion build?"
        placeholder="What should the Legion build?" onChange={(e) => setGoal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e); }} />
      <div className="hb-legion-row">
        <span className="hb-legion-label">Try</span>
        {SAMPLES.map((s) => <button key={s} type="button" className="hb-legion-chip" onClick={() => setGoal(s)}>{s.split(':')[0]}</button>)}
      </div>
      <div className="hb-legion-row">
        <span className="hb-legion-label">Everyone uses</span>
        <span className="hb-legion-model">
          <ModelPicker label="Model for every role" value={everyone} models={models} onChange={(id) => save({ legionModel: id })} />
        </span>
        <label className="hb-legion-check"><input type="checkbox" checked={perRole} onChange={(e) => { setPerRole(e.target.checked); save({ legionPerRole: e.target.checked }); }} /> Pick a model per role</label>
        <label className="hb-legion-check"><input type="checkbox" checked={ask} onChange={(e) => setAsk(e.target.checked)} /> Ask me questions first</label>
        <label className="hb-legion-check" title="Before each job the agent asks itself what it knows; if it is not enough it searches long-term memory and Research, and stores what matters to memory.">
          <input type="checkbox" checked={educate} onChange={(e) => setEducate(e.target.checked)} /> Self-educate
        </label>
        <label className="hb-legion-check"><input type="checkbox" checked={showSpec} onChange={(e) => setShowSpec(e.target.checked)} /> Use my own YAML spec</label>
      </div>
      {showSpec && (
        <div className="hb-legion-specbox">
          <div className="hb-legion-row">
            <span className="hb-legion-hint">The spec is the contract: jobs (each with a UID and an owner) go on the Work Queue, and the Validation Engine runs the checks. Leave this off and the Orchestrator Engine writes one.</span>
            <span className="hb-legion-spacer" />
            <button type="button" className="hb-btn" data-variant="ghost" onClick={() => setSpecYaml(SPEC_EXAMPLE)}>Insert an example</button>
          </div>
          <textarea className="hb-legion-input hb-legion-yaml" rows={10} value={specYaml} spellCheck={false} aria-label="YAML spec"
            placeholder={'goal: ...\njobs:\n  - id: J-001\n    owner: genesis\n    task: ...\nchecks:\n  - job: J-001\n    page_contains: ...'}
            onChange={(e) => setSpecYaml(e.target.value)} />
        </div>
      )}
      {perRole && (
        <div className="hb-legion-picks">
          {LEGION_ROLES.map((r) => (
            <div key={r.id} className="hb-legion-pick" data-role={r.id}>
              <span className="hb-legion-pick-name">{r.name}</span>
              <ModelPicker label={`Model for ${r.name}`} value={picks[r.id] || everyone} models={models}
                onChange={(id) => save({ legionModels: { ...picks, [r.id]: id } })} />
            </div>
          ))}
        </div>
      )}
      <div className="hb-legion-row">
        <span className="hb-legion-hint">Each role runs on your own saved key (Settings, AI keys). Research uses your Tavily key for web search when you have one.</span>
        <span className="hb-legion-spacer" />
        <button type="submit" className="hb-btn" data-primary="true" disabled={(!goal.trim() && !(showSpec && specYaml.trim())) || busy}><Icon.Play size={12} /> Start the Legion</button>
      </div>
      {error && <p className="hb-legion-error" role="alert">{error}</p>}
      <PastRuns onOpen={onOpen} />
    </form>
  );
}

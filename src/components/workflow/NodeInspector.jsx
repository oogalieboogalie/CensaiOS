/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { BRANCH_TESTS, WORKFLOW_TOOLS } from '../../lib/workflow/graph.js';
import { NODE_LOOK, WATCHABLE_KINDS } from './nodeLook.js';
import { EveryPicker } from '../schedule/EveryPicker.jsx';
import { NextRuns } from '../schedule/UpcomingList.jsx';
import { describeEvery, upcomingEvery, whenWords } from '../../lib/schedule/plainWords.js';

function Field({ label, children }) {
  return (
    <label className="hb-wf-field">
      <span className="hb-wf-label">{label}</span>
      {children}
    </label>
  );
}

/** How the workflow starts: when you press Run, on a schedule, or when something lands on the board. */
function StartSettings({ node, flow }) {
  const armed = flow.armed?.mode && flow.armed.mode !== 'manual' ? flow.armed : null;
  const [mode, setMode] = React.useState(armed?.mode || 'manual');
  const [every, setEvery] = React.useState(armed?.everyMinutes || node.everyMinutes || 60);
  const [kind, setKind] = React.useState(armed?.windowKind || node.windowKind || 'doc');
  React.useEffect(() => { if (armed) setMode(armed.mode); }, [armed?.mode]); // keep in step with a teammate's change
  const save = () => {
    flow.patchNode(node.id, { mode, everyMinutes: Number(every), windowKind: kind });
    flow.saveTrigger(mode === 'schedule' ? { mode, everyMinutes: Number(every) } : mode === 'board' ? { mode, windowKind: kind } : { mode: 'manual' });
  };
  return (
    <>
      <Field label="Starts">
        <select className="hb-wf-input" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="manual">When someone presses Run</option>
          <option value="schedule">On a schedule</option>
          <option value="board">When something lands on the board</option>
        </select>
      </Field>
      {mode === 'schedule' && (
        <>
          <EveryPicker value={Number(every)} onChange={setEvery} />
          <NextRuns
            sentence={describeEvery(every)}
            runs={upcomingEvery(every, armed?.mode === 'schedule' && Number(armed.everyMinutes) === Number(every) ? armed.nextRunAt : null, 3)}
          />
          {armed?.lastRunAt && <p className="hb-wf-hint">Last ran {whenWords(armed.lastRunAt, new Date(), { capital: false })}.</p>}
        </>
      )}
      {mode === 'board' && (
        <Field label="When this lands on the board">
          <select className="hb-wf-input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {WATCHABLE_KINDS.map(([id, words]) => <option key={id} value={id}>{words}</option>)}
          </select>
        </Field>
      )}
      <button type="button" className="hb-wf-btn" data-primary={mode !== (armed?.mode || 'manual') ? 'true' : undefined} onClick={save} disabled={flow.pending}>
        {mode === 'manual' ? (armed ? 'Turn off auto start' : 'Save') : armed ? 'Update auto start' : 'Turn on auto start'}
      </button>
      {armed && <p className="hb-wf-hint">Runs on its own as the teammate who turned it on.</p>}
      <Field label="Text the run starts with">
        <textarea className="hb-wf-input" rows={3} value={node.input || ''} placeholder="Optional. Board starts hand over the new window's text."
          onChange={(e) => flow.patchNode(node.id, { input: e.target.value })} />
      </Field>
    </>
  );
}

/** The side panel for the selected step. */
export function NodeInspector({ node, flow, agents, result }) {
  if (!node) {
    return (
      <aside className="hb-wf-inspector">
        <p className="hb-wf-hint">Click a step to change it. Drag from the dot on a step&apos;s right edge to the next step to join them.</p>
      </aside>
    );
  }
  const patch = (fields) => flow.patchNode(node.id, fields);
  return (
    <aside className="hb-wf-inspector" aria-label={`${NODE_LOOK[node.type]?.label} settings`}>
      <div className="hb-wf-label">{NODE_LOOK[node.type]?.label}</div>
      <Field label="Name">
        <input className="hb-wf-input" value={node.title || ''} onChange={(e) => patch({ title: e.target.value })} />
      </Field>
      {node.type === 'trigger' && <StartSettings node={node} flow={flow} />}
      {node.type === 'agent' && (
        <>
          <Field label="Agent">
            <select className="hb-wf-input" value={node.agentId} onChange={(e) => patch({ agentId: e.target.value })}>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="What should it do?">
            <textarea className="hb-wf-input" rows={4} value={node.instructions || ''} onChange={(e) => patch({ instructions: e.target.value })} />
          </Field>
        </>
      )}
      {node.type === 'tool' && (
        <>
          <Field label="Tool">
            <select className="hb-wf-input" value={node.tool} onChange={(e) => patch({ tool: e.target.value })}>
              {Object.entries(WORKFLOW_TOOLS).map(([id, tool]) => <option key={id} value={id}>{tool.label}</option>)}
            </select>
          </Field>
          <Field label="Using the tools of">
            <select className="hb-wf-input" value={node.agentId || 'censai'} onChange={(e) => patch({ agentId: e.target.value })}>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          {WORKFLOW_TOOLS[node.tool]?.equip && (
            <p className="hb-wf-hint">That agent needs {WORKFLOW_TOOLS[node.tool].equip} equipped in the ExoSkeleton.</p>
          )}
        </>
      )}
      {node.type === 'branch' && (
        <>
          <Field label="The text">
            <select className="hb-wf-input" value={node.test} onChange={(e) => patch({ test: e.target.value })}>
              {Object.entries(BRANCH_TESTS).map(([id, words]) => <option key={id} value={id}>{words}</option>)}
            </select>
          </Field>
          <Field label={node.test === 'longer_than' ? 'Characters' : 'Words'}>
            <input className="hb-wf-input" value={node.value || ''} onChange={(e) => patch({ value: e.target.value })} />
          </Field>
          <p className="hb-wf-hint">Yes goes out the top dot, no out the bottom one.</p>
        </>
      )}
      {result?.output && (
        <Field label="Last run">
          <div className="hb-wf-output">{result.output}</div>
        </Field>
      )}
      {result?.error && <p className="hb-wf-error">{result.error}</p>}
      {node.type !== 'trigger' && (
        <button type="button" className="hb-wf-btn" data-danger="true" onClick={() => flow.removeNode(node.id)}>Remove step</button>
      )}
    </aside>
  );
}

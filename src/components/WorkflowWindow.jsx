import React from 'react';
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import { Icon } from './Icons.jsx';
import { getAgentById, getAgents } from '../lib/agentStore.js';
import { WindowTitle } from './Windows.jsx';
import { useWorkflow } from './workflow/useWorkflow.js';
import { WorkflowCanvas } from './workflow/WorkflowCanvas.jsx';
import { NodeInspector } from './workflow/NodeInspector.jsx';
import { NODE_LOOK } from './workflow/nodeLook.js';

const ADDABLE = ['agent', 'tool', 'branch', 'review', 'output'];

const RUN_WORDS = {
  running: 'running', awaiting_review: 'waiting for review', complete: 'finished', failed: 'stopped on an error', stopped: 'stopped',
};

/**
 * Workflow: chain the board's agents together on a node canvas, n8n style,
 * without leaving the board. Each step is a node (Start, Agent, Tool, Check,
 * Review, Result card); lines carry one step's result into the next. Runs
 * happen on the server through the same run engine as agent chats, and every
 * teammate watches each step light up live.
 */
export function WorkflowWindow({ win, onUpdate }) {
  const flow = useWorkflow(win, onUpdate);
  const [selected, setSelected] = React.useState(null);
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [fit, setFit] = React.useState(0);
  const agents = getAgents();
  const { graph, run } = flow;
  const title = win.title || 'Workflow';
  const node = graph.nodes.find((n) => n.id === selected) || null;
  const agentName = (id) => (id ? getAgentById(id)?.name || id : null);

  const add = (type) => {
    const right = graph.nodes.reduce((max, n) => Math.max(max, n.x), 0);
    const anchor = node || graph.nodes[graph.nodes.length - 1];
    const id = flow.addNode(type, { x: right + 226, y: anchor ? anchor.y : 120 });
    setSelected(id);
  };

  const subtitle = run ? `${RUN_WORDS[run.status] || run.status}${run.trigger && run.trigger !== 'manual' ? ` · started by ${run.trigger === 'schedule' ? 'schedule' : 'the board'}` : ''}`
    : `${graph.nodes.length} steps`;
  const live = run && ['running', 'awaiting_review'].includes(run.status);

  return (
    <>
      <WindowTitle icon={<Icon.NewWorkflow size={14} />} label={title} subtitle={subtitle} attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter((a) => a !== id) })}>
        <button type="button" className="hb-wf-btn" onClick={() => setEditingTitle((v) => !v)}>{editingTitle ? 'Done' : 'Rename'}</button>
        {live
          ? <button type="button" className="hb-wf-btn" onClick={flow.stop} disabled={flow.pending}>Stop</button>
          : <button type="button" className="hb-wf-btn" data-primary="true" onClick={flow.start} disabled={flow.pending}>{run ? 'Run again' : 'Run'}</button>}
      </WindowTitle>
      <div className="hb-wf">
        {editingTitle && (
          <input aria-label="Workflow name" className="hb-wf-input hb-wf-name" value={title} onChange={(e) => onUpdate?.({ title: e.target.value })} />
        )}
        <div className="hb-wf-toolbar" role="toolbar" aria-label="Add a step">
          {ADDABLE.map((type) => {
            const Glyph = Icon[NODE_LOOK[type].icon] || Icon.Plus;
            return (
              <button key={type} type="button" className="hb-wf-chip" onClick={() => add(type)}>
                <Glyph size={11} /> {NODE_LOOK[type].label}
              </button>
            );
          })}
          <span className="hb-wf-spacer" />
          <button type="button" className="hb-wf-chip" onClick={() => setFit((n) => n + 1)} title="Show every step">Fit</button>
        </div>
        <div className="hb-wf-body">
          <WorkflowCanvas flow={flow} selected={selected} onSelect={setSelected} agentName={agentName} armed={flow.armed} fitSignal={fit} />
          <NodeInspector node={node} flow={flow} agents={agents} result={node ? run?.nodes?.[node.id] : null} />
        </div>
        {(flow.error || run?.error) && <p className="hb-wf-error" role="alert">{flow.error || run.error}</p>}
        {run?.status === 'complete' && run.finishedAt && !flow.error && (
          <p className="hb-wf-foot">Finished {new Date(run.finishedAt).toLocaleString()}. Results are on the board next to this window.</p>
        )}
      </div>
    </>
  );
}

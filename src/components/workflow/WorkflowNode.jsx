/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { NODE_LOOK, nodeLine, statusLine } from './nodeLook.js';

/** One step on the workflow canvas: what it is, what it does, how it went. */
export function WorkflowNode({ node, result, selected, agentName, armed, onPointerDown, onWire, onReview, style }) {
  const look = NODE_LOOK[node.type] || NODE_LOOK.agent;
  const Glyph = Icon[look.icon] || Icon.Bot;
  const status = result?.status || 'idle';
  const line = statusLine(result);
  const preview = result?.status === 'done' && result.output ? String(result.output).slice(0, 110) : null;
  return (
    <div className="hb-wf-node" data-wf-node={node.id} data-type={node.type} data-status={status}
      data-selected={selected ? 'true' : 'false'} style={style} onPointerDown={onPointerDown}>
      {node.type !== 'trigger' && <span className="hb-wf-port" data-wf-port="in" aria-hidden="true" />}
      <div className="hb-wf-node-head">
        <span className="hb-wf-node-icon"><Glyph size={12} /></span>
        <span className="hb-wf-node-kind">{look.label}</span>
        {status !== 'idle' && status !== 'pending' && <span className="hb-wf-dot" data-status={status} aria-hidden="true" />}
      </div>
      <div className="hb-wf-node-title">{node.title}</div>
      <div className="hb-wf-node-line">{nodeLine(node, { agentName, armed })}</div>
      {line && <div className="hb-wf-node-status" data-status={status}>{line}</div>}
      {preview && <div className="hb-wf-node-preview">{preview}</div>}
      {status === 'waiting' && (
        <div className="hb-wf-node-actions">
          <button type="button" className="hb-wf-btn" data-primary="true" onClick={() => onReview(true)}>Approve</button>
          <button type="button" className="hb-wf-btn" onClick={() => onReview(false)}>Stop</button>
        </div>
      )}
      {node.type === 'branch' ? (
        <>
          <button type="button" className="hb-wf-port" data-wf-port="out" data-port="yes" aria-label="Drag to the step for yes"
            title="Yes: drag to the next step" onPointerDown={(e) => onWire(e, 'yes')}><span>yes</span></button>
          <button type="button" className="hb-wf-port" data-wf-port="out" data-port="no" aria-label="Drag to the step for no"
            title="No: drag to the next step" onPointerDown={(e) => onWire(e, 'no')}><span>no</span></button>
        </>
      ) : node.type !== 'output' && (
        <button type="button" className="hb-wf-port" data-wf-port="out" aria-label="Drag to the next step"
          title="Drag to the next step" onPointerDown={(e) => onWire(e, null)} />
      )}
    </div>
  );
}

/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';

// One routed part of the request: its tags, the agent it goes to, the
// memory that agent brings and the template it starts from.
export function RouterSlip({ part, sent, onSend }) {
  const notes = part.memory?.notes || [];
  return (
    <li className="hb-rt-slip" data-testid="router-slip">
      <div className="hb-rt-slip-head">
        <span className="hb-rt-num">{part.index}</span>
        <span className="hb-rt-ask">{part.text}</span>
      </div>
      <div className="hb-rt-tags" aria-label="Tags">
        {part.tags.map((tag) => <code key={tag} className="hb-rt-tag">[{tag}]</code>)}
      </div>
      <dl className="hb-rt-rows">
        <dt>Agent</dt>
        <dd><b>{part.agent.name}</b> <span className="hb-rt-why">{part.agent.why}</span></dd>
        <dt>Memory</dt>
        <dd>
          <code className="hb-rt-slot">{part.memory?.slot}</code>{' '}
          <span className="hb-rt-why">{notes.length ? `${notes.length} note${notes.length === 1 ? '' : 's'}: ${notes.join('; ')}` : 'no notes on this yet, the agent starts fresh'}</span>
        </dd>
        <dt>Template</dt>
        <dd>
          {part.template.source === 'blueprint' && <span className="hb-rt-badge">Blueprint</span>}
          {part.template.title}
        </dd>
      </dl>
      <div className="hb-rt-slip-foot">
        {sent ? (
          <span className="hb-rt-sent"><Icon.Check size={12} /> Sent on the line to {part.agent.name}</span>
        ) : (
          <button type="button" className="hb-rt-btn" onClick={() => onSend(part)}><Icon.Send size={12} /> Send to {part.agent.name}</button>
        )}
      </div>
    </li>
  );
}

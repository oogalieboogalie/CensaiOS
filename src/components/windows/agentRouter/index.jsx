/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { useAgentRouter } from './useAgentRouter.js';
import { RouterSlip } from './RouterSlip.jsx';
import { windowMeta } from './meta.js';

export { windowMeta };

const EXAMPLE = 'Can we make some documents for work and create a microapp for invoices?';

/**
 * Message Router, from Alex's diagram 03. The board's agents share one line
 * (v1/bus/chat/agent...). You say what you need once; the router cuts it
 * into parts, tags each one like [create] [docs] [work], and picks the
 * agent, that agent's memory and a template (a blueprint when the board has
 * one). Sending a part opens a chat with that agent, already asked.
 */
export function AgentRouterWindow({ win = {} }) {
  const rt = useAgentRouter();
  const [text, setText] = React.useState('');
  const parts = rt.plan?.parts || [];
  const submit = (event) => { event.preventDefault(); rt.route(text); };

  return (
    <>
      <WindowTitle icon={<Icon.Send size={12} />} label={win.title || windowMeta.label} subtitle={rt.plan ? `${parts.length} part${parts.length === 1 ? '' : 's'} routed` : 'one line for every agent'} />
      <div className="hb-rt">
        <section className="hb-rt-line" aria-label="Shared line">
          <span className="hb-rt-line-label">Shared line</span>
          <code className="hb-rt-address" data-testid="router-line">{rt.line}</code>
          <span className="hb-rt-why">{rt.plan ? `${rt.plan.agentsOnLine} agents listening` : 'every agent on this board listens here'}</span>
        </section>
        <form className="hb-rt-form" onSubmit={submit}>
          <textarea
            className="hb-rt-input"
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Say what you need, like "${EXAMPLE}"`}
            aria-label="What do you need?"
          />
          <div className="hb-rt-form-row">
            <button type="button" className="hb-rt-link" onClick={() => setText(EXAMPLE)}>Use the example</button>
            <span className="hb-rt-spacer" />
            {parts.length > 1 && <button type="button" className="hb-rt-btn" onClick={rt.sendAll}><Icon.Send size={12} /> Send all</button>}
            <button type="submit" className="hb-rt-btn hb-rt-btn-primary" disabled={rt.busy || !rt.workspaceId}>{rt.busy ? 'Routing…' : 'Route it'}</button>
          </div>
        </form>
        {rt.error && <p className="hb-rt-error" role="alert">{rt.error}</p>}
        {!rt.workspaceId ? (
          <p className="hb-rt-empty">Open a board first. Each board has its own line.</p>
        ) : parts.length ? (
          <ol className="hb-rt-slips">
            {parts.map((part) => <RouterSlip key={part.index} part={part} sent={rt.sent.has(part.index)} onSend={rt.send} />)}
          </ol>
        ) : (
          <p className="hb-rt-empty">Nothing routed yet. Ask for one thing or several in one line; the router splits it into jobs.</p>
        )}
      </div>
    </>
  );
}

import React from 'react';
import { agentCursorPoint, agentStatus, latestWords, stepTyping, typedText } from '../../lib/collaboration/agentPresence.js';

// Types out only the characters that are new since the last frame, so a
// streamed answer reads like someone typing and a non-streamed one still
// types out instead of appearing at once.
function useTypedText(tail, total) {
  const [shown, setShown] = React.useState(0);
  React.useEffect(() => {
    if (shown >= total) return undefined;
    const frame = requestAnimationFrame(() => setShown((current) => stepTyping(current, total, tail.length)));
    return () => cancelAnimationFrame(frame);
  }, [shown, total, tail.length]);
  return typedText(tail, total, Math.min(shown, total));
}

function AgentCursor({ agent, point, zoom }) {
  const text = useTypedText(agent.tail, agent.total);
  const typing = agent.phase === 'typing' || (agent.phase === 'done' && text);
  return (
    <div
      className="hb-agent-cursor"
      data-testid="agent-cursor"
      data-agent={agent.agentId}
      data-phase={agent.phase}
      style={{ '--agent-cursor': agent.color, transform: `translate3d(${point.x}px, ${point.y}px, 0)` }}
    >
      <div className="hb-agent-cursor__body" style={{ transform: `scale(${1 / (zoom || 1)})` }}>
        <svg className="hb-agent-cursor__arrow" width="18" height="26" viewBox="0 0 18 26" aria-hidden="true">
          <path d="M2 1 L2 19 L7.5 14.5 L10 20 L12.5 18.8 L10 13.5 L15 13.5 Z" />
        </svg>
        <div className="hb-agent-cursor__tag">
          <span className="hb-agent-cursor__name">{agent.name}</span>
          <span className="hb-agent-cursor__status">{agentStatus(agent)}</span>
        </div>
        {typing && (
          <div className="hb-agent-cursor__typed" data-testid="agent-cursor-typed">
            {latestWords(text)}<span className="hb-agent-cursor__caret" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Cursors for agents working on the board, in canvas coordinates. Each one
 * glides to the window its agent is working in or reading, and types the
 * answer as it is written. The positions come from the board's awareness.
 */
export function AgentCursors({ agents = {}, wins = [], zoom = 1 }) {
  const byId = React.useMemo(() => new Map((wins || []).map((win) => [win.id, win])), [wins]);
  const entries = Object.values(agents)
    .map((agent) => ({ agent, point: agentCursorPoint(agent, byId.get(agent.at) || byId.get(agent.home)) }))
    .filter((entry) => entry.point);
  if (!entries.length) return null;
  return (
    // The answer itself lands in the agent's window; the cursor is decoration.
    <div className="hb-agent-cursors" aria-hidden="true">
      {entries.map(({ agent, point }) => <AgentCursor key={agent.key} agent={agent} point={point} zoom={zoom} />)}
    </div>
  );
}

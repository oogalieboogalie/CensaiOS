import React from 'react';
import { AgentAvatar } from '../Agents.jsx';
import { FAMILY_AGENT_BY_ID } from '../../data/family-agents.js';
import { getMailActivity } from '../../lib/api/agentActivity.js';
import { deskEntries } from '../../lib/censai/handoffs.js';
import { useVisibilityAwareInterval } from '../../lib/usePolling.js';

const POLL_MS = 6000;

function when(at) {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// The Family desk: what Censai handed to whom, and what came back, from the
// family mail in this workspace. Polls only while it is on screen.
export function CensaiFamilyDesk({ workspaceId }) {
  const [entries, setEntries] = React.useState([]);
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!workspaceId) return;
    try {
      setEntries(deskEntries(await getMailActivity({ workspaceId })));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoaded(true);
    }
  }, [workspaceId]);

  React.useEffect(() => { load(); }, [load]);
  useVisibilityAwareInterval(load, POLL_MS, { inactive: !workspaceId });

  if (!workspaceId) {
    return <p className="hb-censai-note">Open a board to see the family's messages.</p>;
  }
  if (!loaded) return <p className="hb-censai-note">Checking the family's messages…</p>;
  if (failed && entries.length === 0) {
    return <p className="hb-censai-note">I could not read the family's messages just now. I will try again shortly.</p>;
  }
  if (entries.length === 0) {
    return (
      <p className="hb-censai-note">
        Nothing handed out yet. Ask me for something and I will pass the specialist parts to the right family member. Their answers show up here.
      </p>
    );
  }
  return (
    <ul className="hb-censai-desk" data-testid="censai-family-desk">
      {entries.map((e) => (
        <li key={e.id} className="hb-censai-desk-row" data-direction={e.direction}>
          {FAMILY_AGENT_BY_ID[e.agentId]
            ? <AgentAvatar agent={FAMILY_AGENT_BY_ID[e.agentId]} size={24} />
            : <span className="hb-censai-desk-dot" aria-hidden="true" />}
          <span className="hb-censai-desk-body">
            <span className="hb-censai-desk-who">{e.who}<span className="hb-censai-desk-at">{when(e.at)}</span></span>
            <span className="hb-censai-desk-text">{e.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

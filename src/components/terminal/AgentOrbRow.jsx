import { BrandIcon } from '../brand/BrandIcon.jsx';
import { agentForTab } from './agentTab.js';
import './agentOrb.css';

// A circle. A real mark when the app has one, otherwise an outlined ring
// for the person at the keyboard. Never initials in place of a logo.
function OrbMark({ agent }) {
  if (agent.mark) return <BrandIcon brand={agent.mark} size={30} tone="mono" title="" />;
  return <span className="hb-orb-you" data-mark={agent.you ? 'you' : 'plain'} aria-hidden="true" />;
}

export function AgentOrbRow({ win, tabs, activeId, onSelect, onClose, onKeyDown }) {
  return (
    <div className="hb-orb-row" role="tablist" aria-label="Terminals" onKeyDown={onKeyDown}>
      {tabs.map((tab) => {
        const agent = agentForTab(win, tab);
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className="hb-orb-tab"
            aria-selected={tab.id === activeId}
            data-live={agent.live ? 'true' : 'false'}
            title={`${agent.name}. ${agent.detail}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onSelect?.(tab.id)}
            onAuxClick={(event) => { if (event.button === 1) onClose?.(tab.id); }}
          >
            <span className="hb-orb">
              <OrbMark agent={agent} />
              {agent.status && <span className="hb-orb-status" data-status={agent.status} />}
            </span>
            <span className="hb-orb-copy">
              <b>{agent.name}</b>
              <small>{agent.detail}</small>
              {agent.status === 'busy' && <span className="hb-sr-only">Busy</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

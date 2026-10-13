/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Avatar, StatusPill } from './Avatar.jsx';

const POSTERS = ['Q3 OKR: ship the demo', 'do not panic. delegate.'];

function monitorLines(agent) {
  const lines = agent.log.slice(-4).map((e) => (e.kind === 'tool' ? `$ ${e.text}` : e.kind === 'start' ? `> ${e.text}` : e.text));
  if (agent.tool) lines.push(`$ ${agent.tool}`);
  else if (agent.task && agent.status !== 'napping') lines.push(`> ${agent.task}`);
  return lines.slice(-4);
}

// One department, side on: a wall with windows and posters, desks in a
// row, each agent standing at its desk with its monitor showing what it is
// doing right now. Rename the room in the header; remove it to send its
// agents back to the Lobby.
export function Department({ room, onOpenAgent, onRename, onRemove, editable = true }) {
  const [name, setName] = React.useState(room.name);
  const [blurb, setBlurb] = React.useState(room.blurb);
  React.useEffect(() => { setName(room.name); setBlurb(room.blurb); }, [room.id, room.name, room.blurb]);
  const commit = () => { if (name !== room.name || blurb !== room.blurb) onRename(room.id, { name, blurb }); };

  return (
    <div className="ww-dept" data-testid="ww-department" style={{ '--ww-room': room.color }}>
      <div className="ww-dept-head">
        {editable && !room.lobby ? (
          <div className="ww-dept-fields">
            <input className="ww-title-input" aria-label="Department name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
            <input className="ww-input ww-blurb-input" aria-label="What this department does" value={blurb} maxLength={120} placeholder="What this department does" onChange={(e) => setBlurb(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
          </div>
        ) : (
          <div className="ww-dept-fields"><div className="ww-title">{room.name}</div><div className="ww-faint">{room.blurb}</div></div>
        )}
        <span className="ww-faint">{room.agents.length} agent{room.agents.length === 1 ? '' : 's'}</span>
        {editable && !room.lobby && <button type="button" className="ww-btn" onClick={() => onRemove(room.id)}>Remove department</button>}
      </div>
      <div className="ww-dept-room">
        <div className="ww-wall" aria-hidden="true">
          <span className="ww-window" style={{ left: '8%' }} />
          <span className="ww-window" style={{ left: '62%' }} />
          {POSTERS.map((text, i) => <span key={text} className="ww-poster" style={{ left: i ? '84%' : '36%' }}>{text}</span>)}
        </div>
        <div className="ww-baseboard" aria-hidden="true" />
        <div className="ww-dept-desks">
          {room.agents.length === 0 && <div className="ww-room-empty">Nobody here yet. Drag an agent into this room on the floor, or pick this department in an agent's Job tab.</div>}
          {room.agents.map((agent) => (
            <button key={agent.windowId} type="button" className="ww-station" data-testid="ww-station" data-window-id={agent.windowId} onClick={() => onOpenAgent(agent.windowId)}>
              <span className="ww-monitor" aria-hidden="true">
                <pre>{monitorLines(agent).join('\n') || 'zz'}</pre>
              </span>
              <span className="ww-station-desk" aria-hidden="true"><span className="ww-mug" /></span>
              <span className="ww-station-avatar"><Avatar avatar={agent.avatar} status={agent.status} px={5} /></span>
              <span className="ww-nameplate">{agent.name}</span>
              <StatusPill status={agent.status} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

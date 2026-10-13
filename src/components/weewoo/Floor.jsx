/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Avatar, EnergyBar } from './Avatar.jsx';
import { useFloorBubbles } from './useFloorBubbles.js';
import { officeFeed } from '../../lib/weewoo/office.js';

const DRAG_TYPE = 'application/x-weewoo-agent';

function timeOf(at) {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Seat({ agent, bubble, onOpen, setRef, canSeat }) {
  return (
    <button type="button" className="ww-seat" data-testid="ww-agent" data-window-id={agent.windowId} data-status={agent.status}
      data-mood={agent.mood} ref={setRef} onClick={(e) => { e.stopPropagation(); onOpen(agent.windowId); }}
      draggable={canSeat} onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, agent.windowId); e.dataTransfer.effectAllowed = 'move'; }}
      title={`${agent.name}: ${agent.status}${agent.task ? `, ${agent.task}` : ''}. Mood ${agent.mood}, energy ${Math.round(agent.energy * 100)}%`}>
      <Avatar avatar={agent.avatar} status={agent.status} px={3} bubble={bubble} />
      <span className="ww-desk" aria-hidden="true" />
      <span className="ww-seat-name">{agent.name}</span>
      <EnergyBar value={agent.energy} width={30} />
    </button>
  );
}

// The office floor: a top-down map of the company's departments with every
// agent at a desk. Drag an agent to another room to move it there.
export function Floor({ office, now, onEnterRoom, onOpenAgent, onOpenThread, onSeat, canSeat = true }) {
  const bubbles = useFloorBubbles(office, now);
  const gridRef = React.useRef(null);
  const seatEls = React.useRef(new Map());
  const [overRoom, setOverRoom] = React.useState(null);
  const [, relayout] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { relayout(); }, [bubbles.length]);

  const position = (windowId) => {
    const el = seatEls.current.get(windowId);
    const grid = gridRef.current;
    if (!el || !grid) return null;
    const g = grid.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const scale = grid.offsetWidth ? g.width / grid.offsetWidth : 1;
    return { x: (r.left - g.left + r.width / 2) / scale, y: (r.top - g.top) / scale };
  };
  const sayFor = new Map();
  for (const b of bubbles) if (!b.to) sayFor.set(b.from, b.text);
  const feed = officeFeed(office, 5);

  return (
    <div className="ww-floor" data-testid="ww-floor">
      <div className="ww-floor-grid" ref={gridRef}>
        {office.rooms.map((room) => {
          const busy = room.agents.filter((a) => a.status === 'working').length;
          return (
            <section key={room.id} className="ww-room" data-testid="ww-room" data-dept={room.id} data-lobby={room.lobby ? 'true' : undefined}
              data-wide={room.agents.length > 3 ? 'true' : undefined} data-over={overRoom === room.id ? 'true' : undefined}
              style={{ '--ww-room': room.color }} onClick={() => onEnterRoom(room.id)}
              onDragOver={(e) => { if (canSeat && e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); setOverRoom(room.id); } }}
              onDragLeave={() => setOverRoom((current) => (current === room.id ? null : current))}
              onDrop={(e) => { const id = e.dataTransfer.getData(DRAG_TYPE); setOverRoom(null); if (id) { e.preventDefault(); onSeat(id, room.id); } }}>
              <header className="ww-room-head">
                <span className="ww-room-name">{room.name}</span>
                <span className="ww-room-meta">{busy} working · {room.agents.length} agent{room.agents.length === 1 ? '' : 's'}</span>
              </header>
              {room.blurb && <div className="ww-room-blurb">{room.blurb}</div>}
              <div className="ww-carpet">
                {room.agents.map((agent) => (
                  <Seat key={agent.windowId} agent={agent} bubble={sayFor.get(agent.windowId)} onOpen={onOpenAgent} canSeat={canSeat}
                    setRef={(el) => { if (el) seatEls.current.set(agent.windowId, el); else seatEls.current.delete(agent.windowId); }} />
                ))}
                {room.agents.length === 0 && <span className="ww-room-empty">{room.lobby ? 'New agents arrive here' : 'Drag an agent here'}</span>}
              </div>
            </section>
          );
        })}
        <div className="ww-bubble-layer" aria-live="polite">
          {bubbles.filter((b) => b.to).map((b) => {
            const from = position(b.from);
            const to = position(b.to);
            if (!from) return null;
            const line = to ? { len: Math.hypot(to.x - from.x, to.y - from.y), ang: Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI } : null;
            const fromName = office.agents.find((a) => a.windowId === b.from)?.name || '';
            const toName = office.agents.find((a) => a.windowId === b.to)?.name || '';
            return (
              <React.Fragment key={b.id}>
                {line && <span className="ww-thread-line" style={{ left: from.x, top: from.y - 6, width: line.len, transform: `rotate(${line.ang}deg)` }} />}
                <button type="button" className="ww-floor-bubble" data-kind={b.kind} data-testid="ww-bubble" style={{ left: from.x, top: from.y - 10 }}
                  onClick={(e) => { e.stopPropagation(); onOpenThread(b.thread); }}>
                  <small>{fromName} → {toName}</small>
                  <span>{b.text}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
      <div className="ww-floor-foot">
        <div className="ww-legend">
          <span><i data-status="working" />working</span>
          <span><i data-status="waiting" />waiting</span>
          <span><i data-status="error" />needs help</span>
          <span><i data-status="idle" />idle</span>
          <span><i data-status="napping" />napping</span>
        </div>
        <div className="ww-feed" data-testid="ww-feed">
          <div className="ww-eyebrow">Live activity</div>
          {feed.length === 0 && <div className="ww-feed-row ww-faint">Quiet so far. Ask an agent something and watch it work.</div>}
          {feed.map((row, i) => (
            <div className="ww-feed-row" key={`${row.at}-${i}`}>
              <span className="ww-faint">{timeOf(row.at)}</span>
              <strong>{row.who}</strong>
              <span className="ww-ellipsis">{row.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

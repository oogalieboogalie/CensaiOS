/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { useWorkspaceStore } from '../../../lib/store.js';
import { getAgentById, getAgents, subscribe as subscribeAgents } from '../../../lib/agentStore.js';
import { askBoardAgent, showWindow } from '../../../lib/agentNetwork/askBoardAgent.js';
import { createRegistryClient } from '../../../lib/agentRegistry/client.js';
import { buildOffice } from '../../../lib/weewoo/office.js';
import { DEMO_DEPT_FOR, demoAgentFor, demoWindows } from '../../../lib/weewoo/demoOffice.js';
import {
  WEEWOO_KIND, addDepartmentPatch, companyStarter, editDepartmentPatch, listDepartments, removeDepartmentPatch, seatKey, seatPatch,
} from '../../../lib/weewoo/company.js';
import { Floor } from '../../weewoo/Floor.jsx';
import { Department } from '../../weewoo/Department.jsx';
import { AgentDetail, ThreadOverlay } from '../../weewoo/AgentDetail.jsx';

function useAgentRecords() {
  return React.useSyncExternalStore(subscribeAgents, getAgents, getAgents);
}

function useNow(ms) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

// The demo company: the starter departments with the pretend staff seated.
function demoCompany(name) {
  const company = companyStarter(name);
  for (const [windowId, deptId] of Object.entries(DEMO_DEPT_FOR)) company[seatKey(windowId)] = deptId;
  return company;
}

// WeeWoo: the board's agents as avatars working in a company. One window is
// one company; its departments, seats and the agents' avatars live in the
// board's shared doc, so everyone on the board sees the same office.
export function WeeWooWindow({ win = {}, onUpdate }) {
  const wins = useWorkspaceStore((state) => state.wins);
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const records = useAgentRecords();
  const demo = Boolean(win.demo);
  const now = useNow(demo ? 1000 : 2000);
  const [view, setView] = React.useState({ at: 'floor', id: null });
  const [threadId, setThreadId] = React.useState(null);
  const name = win.title || 'My company';

  // A company opened before it had departments gets the starter set once.
  React.useEffect(() => {
    if (!demo && listDepartments(win).length === 1 && !win.seeded) {
      const { title, ...depts } = companyStarter(name);
      onUpdate?.({ ...depts, seeded: true });
    }
  }, [demo, win, name, onUpdate]);

  const office = React.useMemo(() => {
    if (demo) return buildOffice(demoCompany(name), demoWindows(now), { agentFor: demoAgentFor, now });
    const byId = new Map(records.map((agent) => [agent.id, agent]));
    return buildOffice(win, wins, { agentFor: (id) => byId.get(id) || getAgentById(id), now });
  }, [demo, name, win, wins, records, now]);

  const others = wins.filter((w) => w.kind === WEEWOO_KIND && w.id !== win.id);
  const room = view.at === 'room' ? office.rooms.find((r) => r.id === view.id) : null;
  const agent = view.at === 'agent' ? office.agents.find((a) => a.windowId === view.id) : null;
  const thread = threadId ? office.threads.find((t) => t.id === threadId) : null;
  const agentRoom = agent ? office.rooms.find((r) => r.id === agent.deptId) : null;
  React.useEffect(() => { if ((view.at === 'room' && !room) || (view.at === 'agent' && !agent)) setView({ at: 'floor', id: null }); }, [view.at, room, agent]);

  const updateWindow = (id, patch) => useWorkspaceStore.getState().onUpdate?.(id, patch);
  const seat = (windowId, deptId) => { if (!demo) onUpdate?.(seatPatch(windowId, deptId)); };
  const addDept = () => {
    const patch = addDepartmentPatch(win, { name: 'New department' });
    onUpdate?.(patch);
    setView({ at: 'room', id: Object.keys(patch)[0].slice(3) });
  };

  return (
    <>
      <WindowTitle icon={<Icon.Group size={12} />} label={name} subtitle={`WeeWoo · ${office.agents.length} agent${office.agents.length === 1 ? '' : 's'}`} />
      <div className="ww" data-testid="weewoo" data-demo={demo ? 'true' : undefined}>
        <div className="ww-bar">
          <nav className="ww-crumbs" aria-label="Where you are">
            {view.at === 'floor' && !demo ? (
              <input className="ww-title-input" aria-label="Company name" data-testid="ww-company-name" defaultValue={name} key={name} maxLength={60}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== name) onUpdate?.({ title: v }); }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
            ) : (
              <button type="button" className="ww-crumb" onClick={() => setView({ at: 'floor', id: null })}>{demo ? 'Acme Robotics' : name}</button>
            )}
            {(room || agentRoom) && <><span className="ww-faint">/</span><button type="button" className="ww-crumb" onClick={() => setView({ at: 'room', id: (room || agentRoom).id })}>{(room || agentRoom).name}</button></>}
            {agent && <><span className="ww-faint">/</span><span className="ww-crumb ww-crumb--here">{agent.name}</span></>}
          </nav>
          <span className="ww-pill" data-status={office.working ? 'working' : 'idle'} data-testid="ww-working"><span className="ww-dot" />{office.working} working</span>
          <span className="ww-grow" />
          {others.length > 0 && (
            <select className="ww-input ww-company-switch" aria-label="Other companies on this board" value="" onChange={(e) => e.target.value && showWindow(e.target.value)}>
              <option value="">Other companies…</option>
              {others.map((o) => <option key={o.id} value={o.id}>{o.title || 'Company'}</option>)}
            </select>
          )}
          {!demo && view.at === 'floor' && <button type="button" className="ww-btn" data-testid="ww-add-dept" onClick={addDept}>Add department</button>}
          <button type="button" className="ww-btn" data-testid="ww-demo" aria-pressed={demo} onClick={() => { onUpdate?.({ demo: !demo }); setView({ at: 'floor', id: null }); }}>
            {demo ? 'Back to my agents' : 'Demo office'}
          </button>
        </div>
        {view.at === 'floor' && (
          <div className="ww-company-row">
            <span className="ww-faint">{demo ? 'Acme Robotics is a pretend company, so you can see the office at work. Nothing here is real.' : 'Drag an agent to move it to another department. Click one to see what it is doing.'}</span>
          </div>
        )}

        <div className="ww-stage">
          {!demo && office.agents.length === 0 && view.at === 'floor' && (
            <div className="ww-empty" data-testid="ww-empty">
              <div className="ww-title">No agents on this board yet</div>
              <div className="ww-faint">Open a chat, an Agent Console, Research, LeadHound or a module, and its agent walks into the Lobby here.</div>
            </div>
          )}
          {view.at === 'floor' && (
            <Floor office={office} now={now} canSeat={!demo}
              onEnterRoom={(id) => setView({ at: 'room', id })}
              onOpenAgent={(id) => setView({ at: 'agent', id })}
              onOpenThread={(id) => id && setThreadId(id)} onSeat={seat} />
          )}
          {room && (
            <Department room={room} editable={!demo} onOpenAgent={(id) => setView({ at: 'agent', id })}
              onRename={(id, changes) => onUpdate?.(editDepartmentPatch(win, id, changes))}
              onRemove={(id) => { onUpdate?.(removeDepartmentPatch(win, id)); setView({ at: 'floor', id: null }); }} />
          )}
          {agent && (
            <AgentDetail agent={agent} office={office} demo={demo}
              onSaveAvatar={(avatar) => updateWindow(agent.windowId, { avatar })}
              onResetAvatar={() => updateWindow(agent.windowId, { avatar: null })}
              onSeat={seat} onShowWindow={showWindow} onOpenThread={setThreadId}
              onAsk={(input) => askBoardAgent({ ...input, client: createRegistryClient({ workspaceId: workspaceId || null }), workspaceId })} />
          )}
        </div>
        {thread && <ThreadOverlay thread={thread} office={office} demo={demo} onClose={() => setThreadId(null)} onShowWindow={showWindow} />}
      </div>
    </>
  );
}

export default WeeWooWindow;

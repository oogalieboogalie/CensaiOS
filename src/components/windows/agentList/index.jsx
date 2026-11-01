/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// Agent list: every agent this board knows, like a friends list. Each row
// has a presence dot (working, online, away, offline), a small icon for
// where it runs, and what it is doing right now and for how long. Click one
// for a small chat card. Board windows sync live; the server fills in what
// is not on the board (src/lib/agentList/presence.js).
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { useWorkspaceStore } from '../../../lib/store.js';
import { getAgents, subscribe as subscribeAgents } from '../../../lib/agentStore.js';
import { getPresence, getSelf, subscribePresence } from '../../../lib/modules/presenceRoster.js';
import { showWindow } from '../../../lib/agentNetwork/askBoardAgent.js';
import { getCollaborationClientId } from '../../../lib/collaboration/clientIdentity.js';
import { buildAgentList, filterAgentRows } from '../../../lib/agentList/presence.js';
import { useAgentPresence } from './useAgentPresence.js';
import { AgentRow, GroupHeader } from './AgentRow.jsx';
import { AgentDm } from './AgentDm.jsx';
import { RecentPanel, AddPanel } from './AgentListPanels.jsx';

const TABS = [
  { id: 'agents', label: 'Agents', icon: Icon.List },
  { id: 'recent', label: 'Recent', icon: Icon.History },
  { id: 'add', label: 'Add', icon: Icon.Plus },
];
const DM_SIZE = { w: 420, h: 560 };

function useNow(ms) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

const isChat = (w, agentId) => (w?.kind === 'chat' || w?.kind === 'agent') && w.agentId === agentId;

export function AgentListWindow({ win = {}, isActive, initialServer = null }) {
  const wins = useWorkspaceStore((state) => state.wins);
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const records = React.useSyncExternalStore(subscribeAgents, getAgents, getAgents);
  const people = React.useSyncExternalStore(subscribePresence, getPresence, getPresence);
  const now = useNow(5000);
  const { data: server, error } = useAgentPresence({ workspaceId, isActive, initial: initialServer });
  const [tab, setTab] = React.useState('agents');
  const [query, setQuery] = React.useState('');
  const [closed, setClosed] = React.useState({});
  const [openKey, setOpenKey] = React.useState(null);

  const list = React.useMemo(() => buildAgentList({ wins, agents: records, server, now }), [wins, records, server, now]);
  const shown = React.useMemo(() => {
    const keep = new Set(filterAgentRows(list.rows, query).map((r) => r.key));
    return list.groups.map((g) => ({ ...g, rows: g.rows.filter((r) => keep.has(r.key)) })).filter((g) => g.rows.length);
  }, [list, query]);
  const openRow = list.rows.find((r) => r.key === openKey) || null;
  const chatWin = openRow?.agentId ? wins.find((w) => isChat(w, openRow.agentId)) : null;
  const working = list.counts.busy;
  const online = list.counts.online + list.counts.busy + list.counts.away;
  const me = getSelf().label || 'You';

  const openChat = (row, text = '') => {
    const store = useWorkspaceStore.getState();
    let target = store.wins.find((w) => isChat(w, row.agentId));
    let id = target?.id;
    if (!id) {
      id = store.spawnAt('chat', { agentId: row.agentId, title: row.name }, { x: (win.x || 0) - DM_SIZE.w - 24, y: win.y || 0 }, DM_SIZE);
      target = null;
    }
    if (text) {
      const msgs = Array.isArray(target?.msgs) ? target.msgs : [];
      store.onUpdate?.(id, { msgs: [...msgs, { from: 'me', text, at: new Date().toISOString() }], autoSend: true, autoSendBy: getCollaborationClientId() });
    }
    return id;
  };
  const openRegistry = () => {
    const store = useWorkspaceStore.getState();
    const reg = store.wins.find((w) => w.kind === 'registry');
    if (reg) showWindow(reg.id);
    else store.spawnAt('registry', {}, null, null);
  };

  return (
    <>
      <WindowTitle icon={<Icon.Group size={12} />} label={win.title || 'Agent list'}
        subtitle={`${online} online · ${working} working`} />
      <div className="al" data-testid="agent-list">
        <div className="al-me">
          <span className="al-face" data-status="online">
            <span className="al-tile al-tile--me">{me.slice(0, 1).toUpperCase()}</span>
            <span className="al-dot" data-status="online" aria-hidden="true" />
          </span>
          <span className="al-row-text">
            <span className="al-name">{me}</span>
            <span className="al-line"><span className="al-doing">Online{people.length > 1 ? ` · ${people.length} people on this board` : ''}</span></span>
          </span>
        </div>
        <div className="al-tabs" role="tablist" aria-label="Agent list">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" className="al-tab" aria-selected={tab === t.id} data-testid={`agent-list-tab-${t.id}`}
              title={t.label} onClick={() => setTab(t.id)}>
              <t.icon size={14} /><span>{t.label}</span>
            </button>
          ))}
        </div>
        {tab === 'agents' && (
          <>
            <label className="al-search">
              <Icon.Search size={13} />
              <input className="al-search-input" value={query} placeholder="Search agents" aria-label="Search agents"
                data-testid="agent-list-search" onChange={(e) => setQuery(e.target.value)} />
            </label>
            {error && <div className="al-note" role="status">{error}</div>}
            <div className="al-list" data-testid="agent-list-groups">
              {shown.map((g) => (
                <section key={g.id} className="al-section">
                  <GroupHeader group={g} open={!closed[g.id]} onToggle={() => setClosed((c) => ({ ...c, [g.id]: !c[g.id] }))} />
                  {!closed[g.id] && g.rows.map((row) => (
                    <AgentRow key={row.key} row={row} now={now} selected={row.key === openKey} onOpen={(r) => setOpenKey(r.key === openKey ? null : r.key)} />
                  ))}
                </section>
              ))}
              {!shown.length && <div className="al-note">{query ? 'No agent matches that search.' : 'No agents yet. Open a chat with an agent and it shows up here.'}</div>}
            </div>
          </>
        )}
        {tab === 'recent' && <RecentPanel wins={wins} records={records} server={server} now={now} onPick={(windowId) => windowId && showWindow(windowId)} />}
        {tab === 'add' && <AddPanel rows={list.rows} onChat={(row) => showWindow(openChat(row))} onOpenRegistry={openRegistry} />}
        {openRow && (
          <AgentDm row={openRow} chatWin={chatWin} now={now} onClose={() => setOpenKey(null)}
            onSend={(row, text) => openChat(row, text)} onShowWindow={showWindow} onOpenRegistry={openRegistry} />
        )}
      </div>
    </>
  );
}

export default AgentListWindow;

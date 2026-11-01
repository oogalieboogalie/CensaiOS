/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// The Agent list's other two tabs. Recent: what the board's agents did
// lately (from their shared run records, help cards and the last chats the
// server saw). Add: start a chat with an agent that is not on the board,
// or find more agents in the Agent Registry.
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { buildOffice, officeFeed } from '../../../lib/weewoo/office.js';
import { elapsed } from '../../../lib/agentList/presence.js';
import { AgentFace } from './AgentRow.jsx';

const FEED_LIMIT = 30;

export function RecentPanel({ wins, records, server, now, onPick }) {
  const rows = React.useMemo(() => {
    const byId = new Map(records.map((a) => [a.id, a]));
    const office = buildOffice({}, wins, { agentFor: (id) => byId.get(id) || null, now });
    const board = officeFeed(office, FEED_LIMIT);
    const chats = (server?.chats || []).map((c) => ({
      at: Date.parse(c.at) || 0, who: byId.get(c.agentId)?.name || c.agentId, windowId: null,
      text: c.withName ? `chatted with ${c.withName}` : 'chatted',
    }));
    const seen = new Set(board.map((r) => r.who));
    return [...board, ...chats.filter((c) => !seen.has(c.who))].sort((a, b) => b.at - a.at).slice(0, FEED_LIMIT);
  }, [wins, records, server, now]);

  if (!rows.length) return <div className="al-list"><div className="al-note">Nothing yet. When an agent chats, uses a tool or helps someone, it shows up here.</div></div>;
  return (
    <div className="al-list" data-testid="agent-list-recent">
      {rows.map((r, i) => (
        <button key={`${r.at}-${i}`} type="button" className="al-feed" disabled={!r.windowId} onClick={() => onPick(r.windowId)}>
          <span className="al-feed-who">{r.who}</span>
          <span className="al-feed-text">{r.text}</span>
          <span className="al-since">{elapsed(r.at, now)}</span>
        </button>
      ))}
    </div>
  );
}

export function AddPanel({ rows, onChat, onOpenRegistry }) {
  const offBoard = rows.filter((r) => r.type === 'agent' && !r.onBoard);
  return (
    <div className="al-list" data-testid="agent-list-add">
      <div className="al-note">Agents not on this board yet. Start a chat and they come online.</div>
      {offBoard.map((row) => (
        <div key={row.key} className="al-add-row">
          <AgentFace row={row} size={28} />
          <span className="al-row-text">
            <span className="al-name">{row.name}</span>
            <span className="al-line"><span className="al-doing">{row.role || row.line}</span></span>
          </span>
          <button type="button" className="al-btn" onClick={() => onChat(row)}>Chat</button>
        </div>
      ))}
      {!offBoard.length && <div className="al-note">Every agent you have is on the board already.</div>}
      <button type="button" className="al-btn al-btn--wide" onClick={onOpenRegistry}>
        <Icon.Plug size={13} /> Find more agents, or add one from another censaiOS
      </button>
    </div>
  );
}

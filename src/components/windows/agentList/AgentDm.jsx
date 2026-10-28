/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// The little chat card that pops up when you click an agent in the list:
// its face and presence, where it runs, the last few lines of its chat on
// this board, and a box to send it a message. Sending goes through the
// agent's real chat window (opened next to the list when there is none).
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { AgentFace, HostIcon } from './AgentRow.jsx';
import { PRESENCE_LABEL, elapsed } from '../../../lib/agentList/presence.js';

const SHOW_LINES = 4;

function lastLines(win) {
  const msgs = Array.isArray(win?.msgs) ? win.msgs : [];
  return msgs.filter((m) => m && !m.hidden && typeof m.text === 'string' && m.text.trim()).slice(-SHOW_LINES);
}

export function AgentDm({ row, chatWin, now, onClose, onSend, onShowWindow, onOpenRegistry }) {
  const [draft, setDraft] = React.useState('');
  const inputRef = React.useRef(null);
  React.useEffect(() => { inputRef.current?.focus(); }, [row.key]);
  const canChat = row.type === 'agent';
  const lines = canChat ? lastLines(chatWin) : [];
  const since = elapsed(row.since, now);
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(row, text);
    setDraft('');
  };

  return (
    <div className="al-dm hb-panel" role="dialog" aria-label={`${row.name}`} data-testid="agent-list-dm"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <div className="al-dm-head">
        <AgentFace row={row} size={34} />
        <span className="al-row-text">
          <span className="al-name">{row.name}</span>
          <span className="al-line"><HostIcon host={row.host} /><span className="al-doing">{PRESENCE_LABEL[row.status]}</span></span>
        </span>
        <span className="al-grow" />
        {row.windowId && (
          <button type="button" className="al-icon-btn" title="Show it on the board" aria-label="Show it on the board" onClick={() => onShowWindow(row.windowId)}>
            <Icon.OpenWindow size={13} />
          </button>
        )}
        <button type="button" className="al-icon-btn" title="Close" aria-label="Close" onClick={onClose}><Icon.Close size={13} /></button>
      </div>
      <div className="al-dm-body hb-well">
        <div className="al-dm-now">
          <span className="al-dot al-dot--inline" data-status={row.status} aria-hidden="true" />
          <span>{row.line}{since ? ` · ${since}` : ''}</span>
        </div>
        <div className="al-dm-where">{row.host?.label}</div>
        {lines.map((m, i) => (
          <div key={`${m.at || i}-${i}`} className="al-bubble" data-mine={m.from === 'me' ? 'true' : undefined}>{m.text.length > 280 ? `${m.text.slice(0, 279)}…` : m.text}</div>
        ))}
        {canChat && !lines.length && <div className="al-dm-where">No chat with {row.name} on this board yet.</div>}
      </div>
      {canChat ? (
        <form className="al-dm-send" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input ref={inputRef} className="al-input" value={draft} maxLength={4000} data-testid="agent-list-dm-input"
            placeholder={`Message ${row.name}`} aria-label={`Message ${row.name}`} onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" className="al-icon-btn" title="Send" aria-label="Send" disabled={!draft.trim()}><Icon.Send size={13} /></button>
        </form>
      ) : (
        <div className="al-dm-actions">
          {row.type === 'network'
            ? <button type="button" className="al-btn" onClick={onOpenRegistry}>Ask it in the Agent Registry</button>
            : <button type="button" className="al-btn" onClick={() => onShowWindow(row.windowId)}>Show it on the board</button>}
        </div>
      )}
    </div>
  );
}

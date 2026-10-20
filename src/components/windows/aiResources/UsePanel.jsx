/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// Who uses what: each agent and each open chat window, and the key that
// pays when you use it. Plus who the owner shares this computer's keys with.
import React from 'react';
import { useWorkspaceStore } from '../../../lib/store.js';
import { getAgentById } from '../../../lib/agentStore.js';
import { AgentAvatar } from '../../Agents.jsx';
import { chatRows, routeLabel } from '../../../lib/aiResources/boardUse.js';
import { money } from '../../../lib/aiResources/format.js';

function keyText(keys, keyId) {
  const key = keyId ? keys.find((k) => k.keyId === keyId) : null;
  return key ? ` ${key.masked}` : '';
}

function Sharing({ sharing }) {
  if (!sharing?.available) return null;
  if (!sharing.canManage) {
    return <p className="hb-air-quiet">{sharing.sharedWithMe ? 'The owner of this computer shares its AI keys with you.' : 'The owner of this computer does not share its AI keys with you, so you use your own.'}</p>;
  }
  return (
    <p className="hb-air-quiet">
      {sharing.sharedWith?.length
        ? `You share this computer's keys with: ${sharing.sharedWith.join(', ')}. Change it in Settings, AI keys.`
        : 'You do not share this computer\'s keys with anyone. Change it in Settings, AI keys.'}
    </p>
  );
}

export function UsePanel({ data }) {
  const wins = useWorkspaceStore((s) => s.wins);
  const chats = chatRows(wins, data);
  const keys = data.keys || [];
  return (
    <div className="hb-air-panel">
      <section className="hb-air-section">
        <h3 className="hb-air-label">Chat windows on this board</h3>
        {!chats.length && <p className="hb-air-quiet">No chat windows open on this board.</p>}
        <ul className="hb-air-list">
          {chats.map((c) => (
            <li key={c.windowId} className="hb-air-item">
              <AgentAvatar agent={getAgentById(c.agentId)} size={22} />
              <span className="hb-air-item-main"><strong>{c.title}</strong><span className="hb-air-quiet">{c.model || 'default model'} · pays with {routeLabel(c.route)}{c.masked ? ` ${c.masked}` : ''}</span></span>
              <span className="hb-air-spend">{c.calls ? `${money(c.costUsd)} · ${c.calls} calls` : 'nothing yet'}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="hb-air-section">
        <h3 className="hb-air-label">Agents</h3>
        <ul className="hb-air-list">
          {(data.agents || []).map((a) => (
            <li key={a.id} className="hb-air-item" data-missing={a.route === 'missing' ? 'true' : undefined}>
              <AgentAvatar agent={getAgentById(a.id) || { id: a.id, name: a.name, role: '' }} size={22} />
              <span className="hb-air-item-main"><strong>{a.name}</strong><span className="hb-air-quiet">{[a.provider, a.model].filter(Boolean).join(' · ') || 'censaiOS default model'}{a.borrowed ? ' (default model is off, so it borrows your key)' : ''}</span></span>
              <span className="hb-air-route">{routeLabel(a.route)}{keyText(keys, a.keyId)}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="hb-air-section">
        <h3 className="hb-air-label">Sharing</h3>
        <Sharing sharing={data.sharing} />
      </section>
    </div>
  );
}

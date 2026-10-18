/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { agentMemoryApi } from '../../lib/agentMemory/api.js';
import { stamp } from '../../lib/agentMemory/timeWords.js';
import { EpisodeList } from './AgentMemoryParts.jsx';

function Turn({ turn, agentName }) {
  return (
    <li className="hb-amem-turn" data-speaker={turn.speaker} data-testid="amem-turn">
      <span className="hb-amem-turn-who">{turn.speaker === 'agent' ? agentName : 'You'} · {stamp(turn.at)}</span>
      <span>{turn.text}</span>
    </li>
  );
}

function ChatCard({ chat, agentName }) {
  const [turns, setTurns] = React.useState(null);
  const [error, setError] = React.useState('');
  const toggle = async () => {
    if (turns) { setTurns(null); return; }
    try { setTurns((await agentMemoryApi.chat(chat.id)).turns); } catch (e) { setError(e.message); }
  };
  return (
    <li className="hb-amem-episode" data-testid="amem-chat">
      <div className="hb-aep-hint">
        {stamp(chat.startedAt)} to {stamp(chat.lastAt)} · {chat.messages} messages{chat.boardName ? ` · ${chat.boardName}` : ''}
      </div>
      <div className="hb-amem-summary">{chat.title}</div>
      <div className="hb-aep-hint">Last: {chat.lastLine}</div>
      <button type="button" className="hb-aep-btn" onClick={toggle} data-testid="amem-chat-toggle">
        {turns ? 'Hide messages' : 'Read every message'}
      </button>
      {error && <div className="hb-aep-error" role="alert">{error}</div>}
      {turns && <ol className="hb-amem-chat-turns">{turns.map((t) => <Turn key={t.id} turn={t} agentName={agentName} />)}</ol>}
    </li>
  );
}

/**
 * Past conversations: whole chats, word for word, with the time of every
 * message (not summaries). Search finds the exact messages. Older one-line
 * records from before full chats were kept stay underneath.
 */
export function ConversationList({ agentId, agentName, episodes = [] }) {
  const [chats, setChats] = React.useState(null);
  const [matches, setMatches] = React.useState(null);
  const [q, setQ] = React.useState('');
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let alive = true;
    agentMemoryApi.conversations(agentId)
      .then((r) => { if (alive) setChats(r.chats || []); })
      .catch((e) => { if (alive) { setError(e.message); setChats([]); } });
    return () => { alive = false; };
  }, [agentId]);

  const search = async (e) => {
    e.preventDefault();
    setError('');
    if (!q.trim()) { setMatches(null); return; }
    try { setMatches((await agentMemoryApi.conversations(agentId, q)).matches || []); } catch (err) { setError(err.message); }
  };

  return (
    <>
      <form className="hb-aep-new" onSubmit={search}>
        <input className="hb-aep-input" placeholder="Search what was said" value={q} onChange={(e) => setQ(e.target.value)} data-testid="amem-search" />
        <button type="submit" className="hb-aep-btn">Search</button>
      </form>
      {error && <div className="hb-aep-error" role="alert">{error}</div>}
      {matches ? (
        matches.length === 0 ? <div className="hb-aep-empty">Nothing matches.</div> : (
          <ol className="hb-amem-chat-turns" data-testid="amem-matches">
            {matches.map((t) => <Turn key={t.id} turn={t} agentName={agentName} />)}
          </ol>
        )
      ) : chats === null ? <div className="hb-aep-empty">Loading…</div>
        : chats.length === 0 ? <div className="hb-aep-empty">{agentName} has no saved chats yet. New chats are kept word for word from now on.</div>
          : <ul className="hb-amem-list" data-testid="amem-chats">{chats.map((c) => <ChatCard key={c.id} chat={c} agentName={agentName} />)}</ul>}
      {episodes.length > 0 && !matches && (
        <details className="hb-amem-older">
          <summary className="hb-aep-hint">Older one-line records (from before whole chats were kept)</summary>
          <EpisodeList agentId={agentId} agentName={agentName} initial={episodes} />
        </details>
      )}
    </>
  );
}

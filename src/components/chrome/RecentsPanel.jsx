/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { agentMemoryApi } from '../../lib/agentMemory/api.js';
import { getAgentById } from '../../lib/agentStore.js';
import { useWorkspaceStore } from '../../lib/store.js';
import { glideToWindow } from '../../lib/showWindow.js';
import { createLogger } from '../../lib/logger.js';
import { useEscapeDismiss } from '../../lib/useEscapeDismiss.js';
import { agoWords, stamp } from '../../lib/agentMemory/timeWords.js';
import { msgsFromTurns, windowForChat, windowLabel, windowsByTouch } from '../../lib/recents.js';

const log = createLogger('recents');
export const OPEN_RECENTS = 'censai:open-recents';

function agentName(agentId) {
  return getAgentById(agentId)?.name || agentId || 'Agent';
}

/** Glide the board so a window is in view, and bring it to the front. */
function showWindow(win) {
  useWorkspaceStore.getState().setActiveId(win.id);
  glideToWindow(win);
}

/**
 * Recents: the chats you had with any agent (on this board, or on every
 * board) and the windows you touched here, newest first, each with when.
 * Picking a chat brings its window forward, or reopens it on this board with
 * every message and its time.
 */
export function RecentsPanel() {
  const [open, setOpen] = React.useState(false);
  const [scope, setScope] = React.useState('board');
  const [chats, setChats] = React.useState(null);
  const [error, setError] = React.useState('');
  const workspaceId = useWorkspaceStore((s) => s.workspaceId);
  const wins = useWorkspaceStore((s) => s.wins);
  useEscapeDismiss(open, () => setOpen(false));

  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_RECENTS, onOpen);
    return () => window.removeEventListener(OPEN_RECENTS, onOpen);
  }, []);

  React.useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setChats(null);
    setError('');
    agentMemoryApi.recents(workspaceId, scope)
      .then((result) => { if (alive) setChats(result.chats || []); })
      .catch((e) => { if (alive) { setError(e.message); setChats([]); log.warn('recents failed', { error: e.message }); } });
    return () => { alive = false; };
  }, [open, scope, workspaceId]);

  async function openChat(chat) {
    const here = windowForChat(chat, useWorkspaceStore.getState().wins);
    if (here) {
      log.info('recent chat focused', { chatId: chat.id });
      showWindow(here);
      setOpen(false);
      return;
    }
    try {
      const full = await agentMemoryApi.chat(chat.id);
      const id = useWorkspaceStore.getState().spawnAt('chat', {
        title: agentName(full.agentId),
        agentId: full.agentId, chatId: full.id, msgs: msgsFromTurns(full.turns, full.agentId),
      }, null, { w: 640, h: 760 });
      log.info('recent chat reopened', { chatId: chat.id, windowId: id, messages: full.turns.length });
      setOpen(false);
    } catch (e) {
      log.warn('recent chat reopen failed', { chatId: chat.id, error: e.message });
      setError(e.message);
    }
  }

  if (!open) return null;
  const touched = scope === 'board' ? windowsByTouch(wins) : [];
  const now = new Date();

  return <>
    <div onClick={() => setOpen(false)} className="hb-recents-scrim" />
    <div data-canvas-ui className="hb-glass hb-recents" role="dialog" aria-label="Recents" data-testid="recents-panel">
      <div className="hb-recents-head">
        <div className="hb-recents-title">Recents</div>
        <button type="button" className="hb-aep-icon" aria-label="Close" onClick={() => setOpen(false)}><Icon.Close size={13} /></button>
      </div>
      <div className="hb-aep-tabs" role="tablist">
        {[['board', 'This board'], ['all', 'All boards']].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={scope === id} className="hb-aep-tab"
            data-testid={`recents-tab-${id}`} onClick={() => setScope(id)}>{label}</button>
        ))}
      </div>
      {error && <div className="hb-aep-error" role="alert">{error}</div>}
      <div className="hb-recents-body">
        <div className="hb-aep-label">Chats</div>
        {chats === null ? <div className="hb-aep-empty">Loading…</div>
          : chats.length === 0 ? <div className="hb-aep-empty">No chats yet{scope === 'board' ? ' on this board' : ''}.</div>
            : (
              <ul className="hb-recents-list" data-testid="recents-chats">
                {chats.map((chat) => (
                  <li key={chat.id}>
                    <button type="button" className="hb-recents-row" data-testid="recents-chat" onClick={() => openChat(chat)}
                      title={`Started ${stamp(chat.startedAt)} · last message ${stamp(chat.lastAt)}`}>
                      <span className="hb-recents-line">
                        <span className="hb-recents-name">{agentName(chat.agentId)}</span>
                        <span className="hb-recents-when">{agoWords(chat.lastAt, now)}</span>
                      </span>
                      <span className="hb-recents-text">{chat.title || '(no words)'}</span>
                      <span className="hb-recents-meta">
                        {chat.messages} messages{scope === 'all' && chat.boardName ? ` · ${chat.boardName}` : ''} · last: {chat.lastLine}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        {scope === 'board' && (
          <>
            <div className="hb-aep-label">Windows on this board</div>
            {touched.length === 0 ? <div className="hb-aep-empty">No windows yet.</div> : (
              <ul className="hb-recents-list" data-testid="recents-windows">
                {touched.map(({ win, at }) => (
                  <li key={win.id}>
                    <button type="button" className="hb-recents-row" data-testid="recents-window" onClick={() => { showWindow(win); setOpen(false); }}>
                      <span className="hb-recents-line">
                        <span className="hb-recents-name">{win.agentId && !win.title ? agentName(win.agentId) : windowLabel(win)}</span>
                        <span className="hb-recents-when">{agoWords(at, now)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  </>;
}

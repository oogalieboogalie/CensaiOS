import React from 'react';
import { AgentAvatar } from '../Agents.jsx';
import { useMessengerThreads } from '../../app/toolbar/useMessengerThreads.js';
import { CENSAI_ID } from '../../lib/censai/handoffs.js';
import { CensaiAvatar } from './CensaiAvatar.jsx';
import { CensaiThread } from './CensaiThread.jsx';
import { CensaiFamilyDesk } from './CensaiFamilyDesk.jsx';
import { CensaiTour } from './CensaiTour.jsx';
import { usePinnedOpen, useCensaiState } from './usePinnedChat.js';

const STATE_LINE = { idle: 'Your orchestrator', working: 'Working on it…', talking: 'Just answered' };

// Censai's chat, pinned to the corner of the screen above every window,
// messenger style. Shrinks to Censai's face; opens on Censai's own thread
// (same memory and threads as the dock chat used to have), with the rest of
// the family one tap away and a Family desk showing who Censai handed what.
export function CensaiPinnedChat({ workspaceId }) {
  const [open, setOpen] = usePinnedOpen();
  const [view, setView] = React.useState('chat');
  const chat = useMessengerThreads({ initialId: CENSAI_ID });
  const { agents, active, activeId, setActiveId, setError, draft, setDraft, sending, send } = chat;
  const censaiThread = chat.threads[CENSAI_ID] || [];
  const lastReplyAt = censaiThread.length ? censaiThread[censaiThread.length - 1].ts : 0;
  const state = useCensaiState({ sending: sending && activeId === CENSAI_ID, lastReplyAt });
  const inputRef = React.useRef(null);
  const mounted = React.useRef(false);

  // Focus the box when the person opens the chat or picks someone, never on
  // page load (that would swallow the board's keyboard shortcuts).
  React.useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (open && view === 'chat') inputRef.current?.focus({ preventScroll: true });
  }, [open, view, activeId]);

  if (!open) {
    return (
      <aside className="hb-censai-pinned" data-open="false" data-censai-state={state}>
        <button type="button" className="hb-censai-bubble" onClick={() => setOpen(true)} aria-label="Open chat with Censai" title="Chat with Censai (C)">
          <CensaiAvatar size={52} state={state} />
        </button>
      </aside>
    );
  }

  const pick = (id) => { setActiveId(id); setError(''); setView('chat'); };
  const family = agents.filter((a) => a.id !== CENSAI_ID);

  return (
    <aside className="hb-censai-pinned hb-glass" data-open="true" data-censai-state={state} data-testid="censai-pinned-chat" role="dialog" aria-label="Chat with Censai">
      <header className="hb-censai-head">
        <button type="button" className="hb-censai-face" onClick={() => setOpen(false)} aria-label="Shrink Censai to a bubble" title="Shrink">
          <CensaiAvatar size={36} state={state} />
        </button>
        <span className="hb-censai-title">
          <strong>Censai</strong>
          <span>{STATE_LINE[state]}</span>
        </span>
        <button type="button" className="hb-censai-ghost" onClick={() => setView(view === 'tour' ? 'chat' : 'tour')}>
          Show me around
        </button>
        <button type="button" className="hb-censai-icon" onClick={() => setOpen(false)} aria-label="Shrink chat" title="Shrink">–</button>
      </header>

      <nav className="hb-censai-tabs" aria-label="Censai views">
        <button type="button" aria-pressed={view !== 'desk'} onClick={() => setView('chat')}>Chat</button>
        <button type="button" aria-pressed={view === 'desk'} onClick={() => setView('desk')}>Family desk</button>
      </nav>

      {view !== 'desk' && (
        <div className="hb-censai-heads" role="group" aria-label="Who to talk to">
          <button type="button" onClick={() => pick(CENSAI_ID)} aria-pressed={activeId === CENSAI_ID} aria-label="Chat with Censai" title="Censai">
            <CensaiAvatar size={28} state={state} />
          </button>
          {family.map((a) => (
            <button key={a.id} type="button" onClick={() => pick(a.id)} aria-pressed={activeId === a.id} aria-label={`Chat with ${a.name}`} title={`${a.name} · ${a.role}`}>
              <AgentAvatar agent={a} size={28} />
            </button>
          ))}
        </div>
      )}

      {view === 'tour' && <CensaiTour onDone={() => setView('chat')} />}
      {view === 'desk' && <div className="hb-censai-scroll"><CensaiFamilyDesk workspaceId={workspaceId} /></div>}
      {view === 'chat' && active && <CensaiThread chat={chat} onShowAround={() => setView('tour')} />}

      {view === 'chat' && active && (
        <form className="hb-censai-compose" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={activeId === CENSAI_ID ? 'Tell Censai what you need…' : `Message ${active.name}…`}
            aria-label={`Message ${active.name}`}
          />
          <button type="submit" disabled={sending || !draft.trim()} aria-label="Send message">↑</button>
        </form>
      )}
    </aside>
  );
}

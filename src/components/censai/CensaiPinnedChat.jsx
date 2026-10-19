import React from 'react';
import { AgentAvatar } from '../Agents.jsx';
import { useMessengerThreads } from '../../app/toolbar/useMessengerThreads.js';
import { CENSAI_ID } from '../../lib/censai/handoffs.js';
import { CensaiAvatar } from './CensaiAvatar.jsx';
import { CensaiThread } from './CensaiThread.jsx';
import { CensaiFamilyDesk } from './CensaiFamilyDesk.jsx';
import { CensaiTour } from './CensaiTour.jsx';
import { usePinnedOpen, useCensaiState } from './usePinnedChat.js';
import { usePlanWatch } from './usePlanWatch.js';
import { planResultMessage, runningLine } from '../../lib/censai/plans.js';

const STATE_LINE = { idle: 'Your orchestrator', working: 'Working on it…', talking: 'Just answered' };

// Censai's chat, pinned to the corner of the screen above every window,
// messenger style. Shrinks to Censai's face; opens on Censai's own thread
// (same memory and threads as the dock chat used to have), with the rest of
// the family one tap away and a Family desk showing who Censai handed what.
// Plans Censai hands out run in the background: their steps show live in
// Censai's thread and each ends in one checked result line.
export function CensaiPinnedChat({ workspaceId }) {
  const [open, setOpen] = usePinnedOpen();
  const [view, setView] = React.useState('chat');
  const [unread, setUnread] = React.useState(0);
  const watchRef = React.useRef(null);
  const chat = useMessengerThreads({
    initialId: CENSAI_ID,
    // A reply from Censai may have handed out a plan: look right away.
    onReply: (agentId) => { if (agentId === CENSAI_ID) watchRef.current?.refresh(); },
  });
  const { agents, active, activeId, setActiveId, setError, draft, setDraft, sending, send } = chat;
  const seeing = open && view === 'chat' && activeId === CENSAI_ID;
  const watch = usePlanWatch({
    workspaceId,
    onResult: (plan) => {
      chat.appendMessage(CENSAI_ID, planResultMessage(plan));
      if (!seeing) setUnread((n) => n + 1);
    },
  });
  watchRef.current = watch;
  React.useEffect(() => { if (seeing) setUnread(0); }, [seeing]);
  const censaiThread = chat.threads[CENSAI_ID] || [];
  const lastReplyAt = censaiThread.length ? censaiThread[censaiThread.length - 1].ts : 0;
  const replying = sending && activeId === CENSAI_ID;
  const state = useCensaiState({ sending: replying || watch.plans.length > 0, lastReplyAt });
  const stateLine = !replying && watch.plans.length ? runningLine(watch.plans.length) : STATE_LINE[state];
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
      <aside data-pane-cover className="hb-censai-pinned" data-open="false" data-censai-state={state}>
        <button type="button" className="hb-censai-bubble" onClick={() => setOpen(true)} aria-label="Open chat with Censai" title="Chat with Censai (C)">
          <CensaiAvatar size={52} state={state} unread={unread} />
        </button>
      </aside>
    );
  }

  const pick = (id) => { setActiveId(id); setError(''); setView('chat'); };
  const family = agents.filter((a) => a.id !== CENSAI_ID);

  return (
    <aside data-pane-cover className="hb-censai-pinned hb-glass" data-open="true" data-censai-state={state} data-testid="censai-pinned-chat" role="dialog" aria-label="Chat with Censai">
      <header className="hb-censai-head">
        <button type="button" className="hb-censai-face" onClick={() => setOpen(false)} aria-label="Shrink Censai to a bubble" title="Shrink">
          <CensaiAvatar size={36} state={state} />
        </button>
        <span className="hb-censai-title">
          <strong>Censai</strong>
          <span>{stateLine}</span>
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
      {view === 'chat' && active && (
        <CensaiThread chat={chat} onShowAround={() => setView('tour')} plans={watch.plans} onStopPlan={watch.stop} stopping={watch.stopping} stopError={watch.stopError} />
      )}

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

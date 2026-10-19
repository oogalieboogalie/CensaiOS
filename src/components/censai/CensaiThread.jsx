import React from 'react';
import { MessageBody } from '../chat/MessageBody.jsx';
import { KeyNeededCard } from '../chat/KeyNeededCard.jsx';
import { CENSAI_ID, describeHandoffs } from '../../lib/censai/handoffs.js';
import { CensaiPlanCard } from './CensaiPlanCard.jsx';
import { CensaiPlanChecked } from './CensaiPlanChecked.jsx';

// The message list for whoever is picked in the pinned chat. Censai's
// replies carry a plain "Handed to Nexus" line when Censai passed work on;
// plans running in the background show live under Censai's thread, and a
// plan's result line folds out to what Censai checked.
export function CensaiThread({ chat, onShowAround, plans = [], onStopPlan, stopping = null, stopError = '' }) {
  const { active, msgs, sending, keyCard, error, resend, scrollRef } = chat;
  const isCensai = active?.id === CENSAI_ID;
  // A live plan card grows as its steps come in: keep the newest line in view,
  // unless the person scrolled up to read something.
  const atBottom = React.useRef(true);
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [plans, scrollRef]);

  return (
    <div ref={scrollRef} className="hb-censai-thread" data-testid="censai-thread" onScroll={onScroll}>
      {msgs.length === 0 && (isCensai ? (
        <div className="hb-censai-empty">
          <p>Tell me what you want to get done. I will hold the plan, hand the specialist work to the family, check what comes back, and tell you how it went.</p>
          <button type="button" className="hb-censai-link" onClick={onShowAround}>Show me around the board</button>
        </div>
      ) : (
        <p className="hb-censai-note">Say hi to {active.name}. Same memory as their chat windows on the board.</p>
      ))}
      {msgs.map((m, i) => (
        <div key={`${m.ts || i}-${i}`} className="hb-censai-msg" data-from={m.from === 'me' ? 'me' : 'agent'}>
          {m.from === 'me' ? m.text : <MessageBody text={m.text} />}
          {m.handoffs?.length > 0 && <span className="hb-censai-handoff">{describeHandoffs(m.handoffs)}</span>}
          {m.plan && <CensaiPlanChecked plan={m.plan} />}
        </div>
      ))}
      {isCensai && plans.map((plan) => (
        <CensaiPlanCard key={plan.id} plan={plan} agents={chat.agents} onStop={onStopPlan} stopping={stopping === plan.id} />
      ))}
      {isCensai && stopError && <p className="hb-censai-error">{stopError}</p>}
      {sending && <p className="hb-censai-note">{active.name} is {isCensai ? 'working on it' : 'thinking'}…</p>}
      {keyCard && !sending && (
        <KeyNeededCard keyProvider={keyCard.keyProvider} agentName={active.name} message={keyCard.message} onSaved={resend} />
      )}
      {error && <p className="hb-censai-error">{error}</p>}
    </div>
  );
}

import React from 'react';
import { MessageBody } from '../chat/MessageBody.jsx';
import { KeyNeededCard } from '../chat/KeyNeededCard.jsx';
import { CENSAI_ID, describeHandoffs } from '../../lib/censai/handoffs.js';

// The message list for whoever is picked in the pinned chat. Censai's
// replies carry a plain "Handed to Nexus" line when Censai passed work on.
export function CensaiThread({ chat, onShowAround }) {
  const { active, msgs, sending, keyCard, error, resend, scrollRef } = chat;
  const isCensai = active?.id === CENSAI_ID;

  return (
    <div ref={scrollRef} className="hb-censai-thread" data-testid="censai-thread">
      {msgs.length === 0 && (isCensai ? (
        <div className="hb-censai-empty">
          <p>Tell me what you want to get done. I will hold the plan, hand the specialist work to the family, and tell you who has what.</p>
          <button type="button" className="hb-censai-link" onClick={onShowAround}>Show me around the board</button>
        </div>
      ) : (
        <p className="hb-censai-note">Say hi to {active.name}. Same memory as their chat windows on the board.</p>
      ))}
      {msgs.map((m, i) => (
        <div key={`${m.ts || i}-${i}`} className="hb-censai-msg" data-from={m.from === 'me' ? 'me' : 'agent'}>
          {m.from === 'me' ? m.text : <MessageBody text={m.text} />}
          {m.handoffs?.length > 0 && <span className="hb-censai-handoff">{describeHandoffs(m.handoffs)}</span>}
        </div>
      ))}
      {sending && <p className="hb-censai-note">{active.name} is {isCensai ? 'working on it' : 'thinking'}…</p>}
      {keyCard && !sending && (
        <KeyNeededCard keyProvider={keyCard.keyProvider} agentName={active.name} message={keyCard.message} onSaved={resend} />
      )}
      {error && <p className="hb-censai-error">{error}</p>}
    </div>
  );
}

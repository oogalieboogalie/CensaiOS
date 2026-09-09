import React from 'react';
import { Icon } from './Icons.jsx';
import { AgentAvatar } from './Agents.jsx';
import { getAgents, getAgentById } from '../lib/agentStore.js';
import { WindowTitle } from './Windows.jsx';
import { renderMarkdown } from '../lib/renderMarkdown.jsx';
import { useWorkspaceStore } from '../lib/store.js';
import { useEscapeDismiss, useOutsideDismiss } from '../lib/useEscapeDismiss.js';

export function GroupChatWindow({ win, onUpdate }) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const allAgents = getAgents();
  const [showMemberSelect, setShowMemberSelect] = React.useState(false);
  const memberSelectRef = React.useRef(null);
  useEscapeDismiss(showMemberSelect, () => setShowMemberSelect(false));
  useOutsideDismiss(showMemberSelect, memberSelectRef, () => setShowMemberSelect(false));
  
  // Default to the first 3 agents if none selected
  const activeMembers = win.members || allAgents.slice(0, 3).map(a => a.id);
  const toggleMember = (id) => {
    if (activeMembers.includes(id)) {
      onUpdate({ members: activeMembers.filter(m => m !== id) });
    } else {
      onUpdate({ members: [...activeMembers, id] });
    }
  };

  const defaultMsgs = React.useMemo(() => [], [activeMembers.length]);
  const msgs = win.msgs === undefined ? defaultMsgs : win.msgs;
  const setMsgs = (next) => onUpdate({ msgs: typeof next === 'function' ? next(msgs) : next });
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const scrollRef = React.useRef(null);
  React.useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [msgs]);

  const send = async () => {
    if (!draft.trim() || sending) return;
    const userMsg = { from: 'me', text: draft.trim() };
    const withUser = [...msgs, userMsg];
    setMsgs(withUser);
    setDraft('');
    setSending(true);
    
    try {
      // Hit the group chat API
      const res = await fetch('/api/group-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: withUser,
          agentIds: activeMembers,
          workspaceId,
        })
      });
      const data = await res.json();
      
      // Append the replies
      const newMsgs = [...withUser];
      if (data.replies) {
        data.replies.forEach(reply => {
          newMsgs.push({ from: reply.agentId, text: reply.text });
        });
      }
      setMsgs(newMsgs);
    } catch {
      setMsgs([...withUser, { from: 'system', text: 'Group chat failed to process.' }]);
    }
    setSending(false);
  };

  return (
    <>
      <div style={{ height: 40, borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', padding: '0 12px', paddingRight: 60, background: 'var(--surface-2)', WebkitAppRegion: 'drag', gap: 10 }}>
        <Icon.Group size={16} color="var(--ink-soft)" />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Core Group</span>
        <div style={{ flex: 1 }} />
        <div ref={memberSelectRef} style={{ display: 'flex', position: 'relative', zIndex: 10 }}>
          {activeMembers.slice(0, 5).map((id, i) => {
            const ag = getAgentById(id);
            return ag ? <div key={id} style={{ marginLeft: i > 0 ? -8 : 0, border: '2px solid var(--surface-2)', borderRadius: '50%', zIndex: 5 - i }}><AgentAvatar agent={ag} size={24} /></div> : null;
          })}
          {activeMembers.length > 5 && <div style={{ marginLeft: -8, width: 24, height: 24, borderRadius: '50%', background: 'var(--surface)', border: '2px solid var(--surface-2)', display: 'grid', placeItems: 'center', fontSize: 10, color: 'var(--ink-soft)', zIndex: 0 }}>+{activeMembers.length - 5}</div>}
          <button aria-expanded={showMemberSelect} aria-haspopup="menu" onClick={() => setShowMemberSelect(!showMemberSelect)} style={{ all: 'unset', cursor: 'pointer', marginLeft: 6, padding: '2px 8px', borderRadius: 12, background: 'var(--surface)', fontSize: 11, border: '1px solid var(--hairline)' }}>Edit</button>
          
          {showMemberSelect && (
            <div role="menu" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 12, padding: 8, boxShadow: 'var(--shadow-pop)', zIndex: 20, minWidth: 200 }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-faint)', marginBottom: 6, padding: '0 4px' }}>Members</div>
              {allAgents.map(a => (
                <div key={a.id} onClick={() => toggleMember(a.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', background: activeMembers.includes(a.id) ? 'var(--accent-soft)' : 'transparent' }}
                  onMouseEnter={e => !activeMembers.includes(a.id) && (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={e => !activeMembers.includes(a.id) && (e.currentTarget.style.background = 'transparent')}>
                  <AgentAvatar agent={a} size={20} />
                  <span style={{ fontSize: 13, color: activeMembers.includes(a.id) ? 'var(--accent-ink)' : 'var(--ink)' }}>{a.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {msgs.map((m, i) => {
          if (m.from === 'system') {
            return <div key={i} style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-faint)' }}>{m.text}</div>;
          }
          if (m.from === 'me') {
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'flex-end', minWidth: 0 }}>
                <div style={{ maxWidth: '80%', minWidth: 0, padding: '10px 14px', borderRadius: 12, background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--hairline)', fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>{m.text}</div>
              </div>
            );
          }
          const ag = getAgentById(m.from);
          if (!ag) return null;
          return (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'flex-start', minWidth: 0 }}>
              <AgentAvatar agent={ag} size={24} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: `oklch(0.4 0.1 ${ag.hue})`, marginBottom: 2 }}>{ag.name}</div>
                <div style={{ minWidth: 0, overflowWrap: 'break-word', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink)' }}>
                  {renderMarkdown(m.text, { compact: true })}
                </div>
              </div>
            </div>
          );
        })}
        {sending && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-start' }}>
            <div style={{ fontSize: 13, color: 'var(--ink-faint)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>Group thinking</span>
              <span style={{ display: 'inline-flex', gap: 3, opacity: 0.7 }}>
                {[0,1,2].map(i => <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor', animation: `gen-bounce 1.2s ease-in-out ${i * 0.15}s infinite` }} />)}
              </span>
            </div>
          </div>
        )}
      </div>
      
      <div style={{ padding: '8px 10px 10px', borderTop: '1px solid var(--hairline)', display: 'flex', gap: 6, alignItems: 'center' }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Message the group..." disabled={sending}
          style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 10, padding: '8px 12px', font: '13px/1.4 var(--font-sans)', color: 'var(--ink)', outline: 'none' }} />
        <button onClick={send} title="Send" disabled={sending}
          style={{ all: 'unset', cursor: sending ? 'wait' : 'pointer', width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--accent-ink)', background: 'var(--accent-soft)', opacity: sending ? 0.5 : 1 }}><Icon.Send size={14}/></button>
      </div>
    </>
  );
}

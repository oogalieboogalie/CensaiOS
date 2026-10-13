/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from './Icons.jsx';
import { AgentAvatar } from './Agents.jsx';
import { getAgents, getAgentById } from '../lib/agentStore.js';
import { WindowTitle } from './Windows.jsx';
import { useWorkspaceStore } from '../lib/store.js';
import { useEscapeDismiss, useOutsideDismiss } from '../lib/useEscapeDismiss.js';
import { copyToClipboard } from '../lib/chat/clipboard.js';
import { sendToCanvas } from '../lib/chat/sendToCanvas.js';
import { ChatBubble } from './chat/ChatBubble.jsx';
import { ChatInput } from './chat/ChatInput.jsx';
import { ChatEmptyState } from './chat/ChatEmptyState.jsx';
import { ChatStatus } from './chat/ChatStatus.jsx';

const GROUP_STARTERS = [
  'Each of you: what would you do first on this project?',
  'Disagree with each other about the riskiest part of the plan',
  'Split this task between you and say who owns what',
];

function MemberPicker({ allAgents, activeMembers, onToggle }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  useEscapeDismiss(open, () => setOpen(false));
  useOutsideDismiss(open, ref, () => setOpen(false));
  return (
    <span ref={ref} data-no-drag style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', position: 'relative' }}>
      <span style={{ display: 'inline-flex' }}>
        {activeMembers.slice(0, 5).map((id, i) => {
          const ag = getAgentById(id);
          return ag ? <span key={id} style={{ marginLeft: i > 0 ? 'calc(-1 * var(--space-1))' : 0 }}><AgentAvatar agent={ag} size={18} /></span> : null;
        })}
        {activeMembers.length > 5 && <span className="hb-msg-author-meta" style={{ marginLeft: 'var(--space-1)', fontSize: 'var(--text-xs)' }}>+{activeMembers.length - 5}</span>}
      </span>
      <button type="button" className="hb-text-btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(o => !o)}>Edit</button>
      {open && (
        <div role="menu" className="hb-model-menu" style={{ top: 'calc(100% + var(--space-1))', bottom: 'auto', left: 'auto', right: 0, width: 'var(--space-56)' }}>
          <div className="hb-model-group">Members</div>
          {allAgents.map(a => (
            <button key={a.id} type="button" role="menuitemcheckbox" aria-checked={activeMembers.includes(a.id)}
              className="hb-model-item" onClick={() => onToggle(a.id)}>
              <AgentAvatar agent={a} size={18} />
              <span>{a.name}</span>
              {activeMembers.includes(a.id) && <Icon.Check size={12} />}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

export function GroupChatWindow({ win, onUpdate }) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const allAgents = getAgents();

  // Default to the first 3 agents if none selected
  const activeMembers = win.members || allAgents.slice(0, 3).map(a => a.id);
  const toggleMember = (id) => {
    onUpdate({ members: activeMembers.includes(id) ? activeMembers.filter(m => m !== id) : [...activeMembers, id] });
  };

  const defaultMsgs = React.useMemo(() => [], [activeMembers.length]);
  const msgs = win.msgs === undefined ? defaultMsgs : win.msgs;
  const setMsgs = (next) => onUpdate({ msgs: typeof next === 'function' ? next(msgs) : next });
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [copied, setCopied] = React.useState(null);
  const scrollRef = React.useRef(null);
  React.useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [msgs, sending]);

  const send = async (_auto = null, textOverride = null) => {
    const text = String(textOverride ?? draft).trim();
    if (!text || sending) return;
    const withUser = [...msgs, { from: 'me', text }];
    setMsgs(withUser);
    setDraft('');
    setSending(true);
    try {
      const res = await fetch('/api/group-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: withUser, agentIds: activeMembers, workspaceId }),
      });
      const data = await res.json();
      setMsgs([...withUser, ...(data.replies || []).map(reply => ({ from: reply.agentId, text: reply.text }))]);
    } catch {
      setMsgs([...withUser, { from: 'system', text: 'Group chat failed to process.' }]);
    }
    setSending(false);
  };

  const copy = async (message, index) => {
    if (!(await copyToClipboard(message?.text))) return;
    setCopied(index);
    window.setTimeout(() => setCopied(current => (current === index ? null : current)), 1200);
  };

  const members = activeMembers.map(id => getAgentById(id)).filter(Boolean);
  const visible = msgs.filter(m => !m.hidden);

  return (
    <>
      <WindowTitle icon={<Icon.Group size={14} />} label="Group chat" subtitle={`${members.length} agent${members.length === 1 ? '' : 's'}`}>
        <MemberPicker allAgents={allAgents} activeMembers={activeMembers} onToggle={toggleMember} />
      </WindowTitle>
      <div className="hb-chat" data-chat-root>
        <div ref={scrollRef} className="hb-chat-scroll">
          {visible.length === 0 && !sending ? (
            <ChatEmptyState agents={members} title="Group chat" blurb="Everyone here answers in turn, so you get each point of view on the same question."
              starters={GROUP_STARTERS} onPick={(prompt) => send(null, prompt)} />
          ) : (
            <div className="hb-chat-col">
              {msgs.map((m, i) => {
                const ag = m.from === 'me' || m.from === 'system' ? null : getAgentById(m.from);
                if (m.from !== 'me' && m.from !== 'system' && !ag) return null;
                return (
                  <ChatBubble key={i} message={m} index={i} agent={ag} showAuthor={Boolean(ag)}
                    copied={copied === i} onCopy={copy} onSend={(artifact) => sendToCanvas(win.id, artifact)} />
                );
              })}
              {sending && (
                <div className="hb-msg" data-from="agent">
                  <ChatStatus liveStatus={{ status: 'thinking' }} activityLog={[]} />
                </div>
              )}
            </div>
          )}
        </div>
        <ChatInput draft={draft} setDraft={setDraft} sending={sending} send={send} modelChip={null} placeholder="Message the group" />
      </div>
    </>
  );
}

import React from 'react';
import { Icon } from '../Icons.jsx';
import { AgentAvatar } from '../Agents.jsx';
import { getAgents } from '../../lib/agentStore.js';
import { ANNOTATION_COLORS } from './DocData.js';

export function SelectionBar({ x, y, onPick }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y - 36, zIndex: 10, transform: 'translate(-50%, 0)', background: 'var(--ink)', color: 'var(--surface)', borderRadius: 999, padding: 4, display: 'flex', gap: 2, boxShadow: '0 4px 14px oklch(0 0 0 / 0.3)' }}>
      <SelBtn icon={<Icon.Chat size={13}/>} label="Comment" onClick={() => onPick('comment')} />
      <SelBtn icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-.7.5-1.5 1-1.5 2v.5M12 17.5v.01"/></svg>} label="Ask" onClick={() => onPick('ask')} />
      <SelBtn icon={<Icon.ArrowAssign size={13}/>} label="Assign" onClick={() => onPick('assign')} />
    </div>
  );
}

function SelBtn({ icon, label, onClick }) {
  return <button onClick={onClick} title={label} style={{ all: 'unset', cursor: 'pointer', padding: '5px 10px 5px 8px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--surface)', opacity: 0.85 }}
    onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; e.currentTarget.style.background = 'oklch(1 0 0 / 0.08)'; }}
    onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.85; e.currentTarget.style.background = 'transparent'; }}>
    {icon}<span>{label}</span>
  </button>;
}

export function AnnotationComposer({ x, y, kind, quote, onCommit, onCancel }) {
  const agents = getAgents();
  const needsAgent = kind === 'ask' || kind === 'assign';
  const [body, setBody] = React.useState('');
  const [agentId, setAgentId] = React.useState(needsAgent ? agents[0]?.id : null);
  const inputRef = React.useRef(null);
  const c = ANNOTATION_COLORS[kind];

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div style={{ position: 'absolute', left: Math.min(x, 400), top: y + 14, zIndex: 11, transform: 'translate(-50%, 0)', background: 'var(--surface)', border: `1px solid ${c.ring}`, borderRadius: 12, padding: 10, width: 280, boxShadow: 'var(--shadow-pop)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: c.ink, background: c.bg, padding: '2px 6px', borderRadius: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{kind}</span>
        <div style={{ flex: 1 }} />
        <button onClick={onCancel} style={{ all: 'unset', cursor: 'pointer', color: 'var(--ink-faint)' }}><Icon.Close size={12}/></button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontStyle: 'italic', borderLeft: `2px solid ${c.ring}`, paddingLeft: 6, marginBottom: 8, maxHeight: 50, overflow: 'hidden' }}>"{quote.length > 100 ? quote.slice(0, 100) + '…' : quote}"</div>
      {needsAgent && <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {agents.map(a => <button key={a.id} onClick={() => setAgentId(a.id)} title={a.name} style={{ all: 'unset', cursor: 'pointer', borderRadius: '50%', padding: 1, boxShadow: agentId === a.id ? `0 0 0 2px ${c.ring}` : '0 0 0 0px transparent' }}><AgentAvatar agent={a} size={22} /></button>)}
      </div>}
      <textarea ref={inputRef} value={body} onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onCommit(body, agentId); } if (e.key === 'Escape') onCancel(); }}
        placeholder={kind === 'comment' ? 'Add a comment…' : kind === 'ask' ? 'What do you want to ask?' : 'What needs doing?'}
        style={{ width: '100%', resize: 'none', minHeight: 50, border: '1px solid var(--hairline)', borderRadius: 8, padding: 8, font: '13px/1.4 var(--font-sans)', color: 'var(--ink)', background: 'var(--surface-2)', outline: 'none' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '0.05em' }}>Ctrl+Enter to save</span>
        <button onClick={() => onCommit(body, agentId)} style={{ all: 'unset', cursor: 'pointer', padding: '5px 12px', borderRadius: 999, background: c.ring, color: 'white', fontSize: 11, fontWeight: 600 }}>{kind === 'ask' ? 'Ask' : kind === 'assign' ? 'Assign' : 'Save'}</button>
      </div>
    </div>
  );
}

import React from 'react';
import { Icon } from '../Icons.jsx';
import { AgentAvatar } from '../Agents.jsx';
import { getAgents } from '../../lib/agentStore.js';
import { kindVars } from './DocData.js';

export function SelectionBar({ x, y, onPick }) {
  return (
    <div className="doc-selbar" style={{ left: x, top: y - 36 }}>
      <SelBtn icon={<Icon.Chat size={13}/>} label="Comment" onClick={() => onPick('comment')} />
      <SelBtn icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-.7.5-1.5 1-1.5 2v.5M12 17.5v.01"/></svg>} label="Ask" onClick={() => onPick('ask')} />
      <SelBtn icon={<Icon.ArrowAssign size={13}/>} label="Assign" onClick={() => onPick('assign')} />
    </div>
  );
}

function SelBtn({ icon, label, onClick }) {
  return <button type="button" onClick={onClick} title={label} className="doc-selbtn">{icon}<span>{label}</span></button>;
}

export function AnnotationComposer({ x, y, kind, quote, onCommit, onCancel }) {
  const agents = getAgents();
  const needsAgent = kind === 'ask' || kind === 'assign';
  const [body, setBody] = React.useState('');
  const [agentId, setAgentId] = React.useState(needsAgent ? agents[0]?.id : null);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="doc-composer" style={{ left: Math.min(x, 400), top: y + 14, ...kindVars(kind) }}>
      <div className="doc-composer-head">
        <span className="doc-kind">{kind}</span>
        <button type="button" onClick={onCancel} className="doc-x"><Icon.Close size={12}/></button>
      </div>
      <div className="doc-quote doc-composer-quote">"{quote.length > 100 ? quote.slice(0, 100) + '…' : quote}"</div>
      {needsAgent && <div className="doc-agents">
        {agents.map(a => <button type="button" key={a.id} onClick={() => setAgentId(a.id)} title={a.name} aria-pressed={agentId === a.id} className="doc-agent"><AgentAvatar agent={a} size={22} /></button>)}
      </div>}
      <textarea ref={inputRef} value={body} onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onCommit(body, agentId); } if (e.key === 'Escape') onCancel(); }}
        placeholder={kind === 'comment' ? 'Add a comment…' : kind === 'ask' ? 'What do you want to ask?' : 'What needs doing?'}
        className="doc-composer-input" />
      <div className="doc-composer-foot">
        <span className="doc-composer-tip">Ctrl+Enter to save</span>
        <button type="button" onClick={() => onCommit(body, agentId)} className="doc-commit">{kind === 'ask' ? 'Ask' : kind === 'assign' ? 'Assign' : 'Save'}</button>
      </div>
    </div>
  );
}

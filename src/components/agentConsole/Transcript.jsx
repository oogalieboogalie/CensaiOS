/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { renderMarkdown } from '../../lib/renderMarkdown.jsx';
import { diffLines } from './lineDiff.js';

// The console's transcript: typed step cards instead of raw terminal text.
// message · thinking · read · search · edit (inline diff) · command (output
// block) · plan · permission (allow / deny) · error · note.

const KIND_ICON = {
  read: Icon.Eye, search: Icon.Search, edit: Icon.Edit, command: Icon.Terminal,
  todo: Icon.List, tool: Icon.Tools, permission: Icon.Shield,
};

function StepStatus({ status }) {
  if (status === 'running') return <span className="ac-step-status ac-step-status--running"><span className="ac-spinner" aria-hidden="true" />working</span>;
  if (status === 'error') return <span className="ac-step-status ac-step-status--error">failed</span>;
  return null;
}

export function InlineDiff({ diff, maxLines = 40 }) {
  const [all, setAll] = React.useState(false);
  const lines = React.useMemo(() => (diff ? diffLines(diff.before || '', diff.after || '') : []), [diff]);
  if (!diff) return null;
  const shown = all ? lines : lines.slice(0, maxLines);
  return (
    <div className="ac-diff" role="group" aria-label={`Changes to ${diff.path}`}>
      {shown.map((line, i) => (
        <div key={i} className={`ac-diff-line ac-diff-line--${line.type}`}>
          <span className="ac-diff-sign">{line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}</span>
          <span className="ac-diff-text">{line.text || ' '}</span>
        </div>
      ))}
      {lines.length > maxLines && !all && (
        <button type="button" className="ac-link" onClick={() => setAll(true)}>Show {lines.length - maxLines} more lines</button>
      )}
    </div>
  );
}

function PermissionBar({ item, onDecide, canDecide }) {
  const perm = item.permission;
  if (!perm) return null;
  if (perm.status === 'pending') {
    return (
      <div className="ac-perm" data-testid="permission-request">
        <Icon.Shield size={13} />
        <span className="ac-perm-text">Waiting for you: allow this {item.kind === 'command' ? 'command' : item.kind === 'edit' ? 'edit' : 'step'}?</span>
        <button type="button" className="ac-btn" disabled={!canDecide} onClick={() => onDecide(perm.id, false)}>Deny</button>
        <button type="button" className="ac-btn ac-btn--primary" disabled={!canDecide} data-testid="permission-allow" onClick={() => onDecide(perm.id, true)}>Allow once</button>
      </div>
    );
  }
  const verb = perm.status === 'allowed' ? 'Allowed' : perm.status === 'denied' ? 'Denied' : 'Cancelled';
  return <div className={`ac-perm-done ac-perm-done--${perm.status}`}>{verb}{perm.decidedBy ? ` by ${perm.decidedBy}` : ''}</div>;
}

function Collapsible({ label, children, defaultOpen = false }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="ac-collapse">
      <button type="button" className="ac-collapse-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon.Chevron size={11} style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
        {label}
      </button>
      {open && children}
    </div>
  );
}

function StepCard({ item, onDecide, canDecide, onOpenFile }) {
  const KindIcon = KIND_ICON[item.kind] || Icon.Tools;
  const pending = item.permission?.status === 'pending';
  const compact = (item.kind === 'read' || item.kind === 'search' || item.kind === 'tool') && !pending;
  return (
    <article className={`ac-step ac-step--${item.kind}${pending ? ' ac-step--pending' : ''}${compact ? ' ac-step--compact' : ''}`} data-kind={item.kind}>
      <header className="ac-step-head">
        <span className="ac-step-icon"><KindIcon size={13} /></span>
        <span className="ac-step-title">{item.title}</span>
        {item.path && item.kind !== 'read' && (
          <button type="button" className="ac-step-path" title="Open in Code Editor" onClick={() => onOpenFile?.(item.path)}>{item.path}</button>
        )}
        {item.kind === 'read' && item.path && <span className="ac-step-path ac-step-path--plain">{item.path}</span>}
        <StepStatus status={item.status} />
      </header>
      {item.kind === 'command' && (
        <div className="ac-block">
          <div className="ac-block-cmd"><span className="ac-block-prompt">$</span>{item.command}</div>
          {item.output && (
            <Collapsible label={`Output${item.exitCode != null ? ` · exit ${item.exitCode}` : ''}`} defaultOpen={item.status === 'error'}>
              <pre className="ac-block-out">{item.output}</pre>
            </Collapsible>
          )}
        </div>
      )}
      {item.kind === 'edit' && item.diff && <InlineDiff diff={item.diff} />}
      {item.kind === 'edit' && !item.diff && Array.isArray(item.files) && (
        <ul className="ac-files-inline">{item.files.map((f) => <li key={f.path}><span className={`ac-change ac-change--${f.kind}`}>{f.kind}</span>{f.path}</li>)}</ul>
      )}
      {item.kind === 'todo' && Array.isArray(item.todos) && (
        <ul className="ac-todos">
          {item.todos.map((t, i) => (
            <li key={i} className={`ac-todo ac-todo--${t.status}`}><span className="ac-todo-box">{t.status === 'completed' ? <Icon.Check size={10} /> : null}</span>{t.text}</li>
          ))}
        </ul>
      )}
      {(item.kind === 'read' || item.kind === 'search' || item.kind === 'tool') && item.output && (
        <Collapsible label="Result"><pre className="ac-block-out">{item.output}</pre></Collapsible>
      )}
      {item.kind === 'edit' && item.status === 'error' && item.output && <div className="ac-step-error">{item.output}</div>}
      {item.kind === 'permission' && item.detail && <pre className="ac-block-out">{item.detail}</pre>}
      {item.kind === 'permission' && item.diff && <InlineDiff diff={item.diff} />}
      <PermissionBar item={item} onDecide={onDecide} canDecide={canDecide} />
    </article>
  );
}

export function TranscriptItem({ item, onDecide, canDecide, onOpenFile }) {
  if (item.kind === 'prompt') {
    return (
      <div className="ac-prompt">
        <span className="ac-prompt-by"><Icon.Person size={12} />{item.by || 'You'}</span>
        <div className="ac-prompt-text">{item.text}</div>
      </div>
    );
  }
  if (item.kind === 'message') {
    return <div className="ac-message">{renderMarkdown(item.text || '', { compact: true })}</div>;
  }
  if (item.kind === 'thinking') {
    return (
      <div className="ac-thinking">
        <Collapsible label="Thinking"><div className="ac-thinking-text">{item.text}</div></Collapsible>
      </div>
    );
  }
  if (item.kind === 'note') return <div className="ac-note">{item.text}</div>;
  if (item.kind === 'error') return <div className="ac-error" role="alert"><Icon.Alert size={13} />{item.text}</div>;
  return <StepCard item={item} onDecide={onDecide} canDecide={canDecide} onOpenFile={onOpenFile} />;
}

export function Transcript({ items, onDecide, canDecide = true, onOpenFile, live }) {
  const endRef = React.useRef(null);
  const boxRef = React.useRef(null);
  const stick = React.useRef(true);
  React.useEffect(() => {
    if (stick.current) endRef.current?.scrollIntoView({ block: 'end' });
  }, [items]);
  const onScroll = () => {
    const el = boxRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };
  return (
    <div className="ac-transcript" ref={boxRef} onScroll={onScroll} data-testid="agent-transcript">
      {items.map((item) => <TranscriptItem key={item.id} item={item} onDecide={onDecide} canDecide={canDecide} onOpenFile={onOpenFile} />)}
      {live && <div className="ac-working"><span className="ac-spinner" aria-hidden="true" />Working</div>}
      <div ref={endRef} />
    </div>
  );
}

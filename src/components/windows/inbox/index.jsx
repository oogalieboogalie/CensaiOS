/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from '../WindowTitle.jsx';
import { Icon } from '../../Icons.jsx';
import { useWorkspaceStore } from '../../../lib/store.js';
import { windowMeta } from './meta.js';
import { useInbox } from './useInbox.js';
import { useInboxFixes, fixActionFor } from './useInboxFixes.js';
import { InboxDock, InboxList, UndoToast } from './InboxParts.jsx';
import { InboxDetail } from './InboxDetail.jsx';

export { windowMeta };

const EMPTY_GROUPS = [
  { id: 'needs', label: 'Needs you' }, { id: 'working', label: 'In progress' },
  { id: 'ready', label: 'Ready' }, { id: 'done', label: 'Done' },
];

function RepoField({ repo, onSave }) {
  const [text, setText] = React.useState(repo);
  React.useEffect(() => setText(repo), [repo]);
  return (
    <form className="hb-inbox-repo" onSubmit={(e) => { e.preventDefault(); onSave(text); }}>
      <Icon.Github size={12} />
      <input value={text} spellCheck={false} placeholder="owner/repo to watch" aria-label="GitHub repo to watch" onChange={(e) => setText(e.target.value)} />
    </form>
  );
}

function open(item) {
  const { spawnAt } = useWorkspaceStore.getState();
  if (item.kind === 'pr' && item.url) spawnAt('browser', { url: item.url, title: `#${item.number}` });
  else if (item.kind === 'agent') spawnAt('agentConsole', { taskId: item.taskId, title: item.cliLabel || 'Agent Console' });
}

/**
 * The Inbox: only what needs you. Pull requests (red checks, conflicts,
 * ready to land), coding agents (waiting for an OK, working, stuck) and
 * errors in one list, a detail pane with plain numbers and the agent's live
 * log, and one click to have an agent fix it or to acknowledge it.
 * Keys while the window is focused: J/K move, E acknowledge, F fix, O open, U undo.
 */
export function InboxWindow({ win = {}, onUpdate, currentProject }) {
  const inbox = useInbox(win, onUpdate, currentProject);
  const fixes = useInboxFixes(win, onUpdate, { me: inbox.me, refresh: inbox.refresh });
  const [selectedId, setSelectedId] = React.useState(null);
  const [showAcked, setShowAcked] = React.useState(false);
  const groups = inbox.data?.groups || EMPTY_GROUPS;
  const list = showAcked ? inbox.acknowledged : inbox.items;
  const selected = list.find((i) => i.id === selectedId) || list[0] || null;
  const needs = inbox.items.filter((i) => i.group === 'needs').length;

  const move = (step) => {
    if (!list.length) return;
    const at = Math.max(0, list.findIndex((i) => i.id === selected?.id));
    setSelectedId(list[Math.min(list.length - 1, Math.max(0, at + step))].id);
  };
  const acknowledge = (item) => {
    if (!item) return;
    const at = list.findIndex((i) => i.id === item.id);
    setSelectedId((list[at + 1] || list[at - 1] || {}).id || null);
    inbox.acknowledge(item);
  };

  const onKeyDown = (e) => {
    if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return;
    const k = e.key.toLowerCase();
    const undoKey = (e.metaKey || e.ctrlKey) && k === 'z';
    if (e.altKey || ((e.metaKey || e.ctrlKey) && !undoKey)) return;
    let handled = true;
    if (k === 'j' || e.key === 'ArrowDown') move(1);
    else if (k === 'k' || e.key === 'ArrowUp') move(-1);
    else if (k === 'e') acknowledge(selected);
    else if (k === 'f' && fixActionFor(selected)) fixes.fix(selected);
    else if (k === 'o' && selected) open(selected);
    else if (k === 'u' || undoKey) handled = inbox.undoAck();
    else handled = false;
    // Keep the board's own single-key tools (and its undo) from firing too.
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  };

  return (
    <>
      <WindowTitle
        icon={<Icon.Inbox size={14} />}
        label={win.title || windowMeta.label}
        subtitle={needs ? `${needs} need${needs === 1 ? 's' : ''} you` : 'All clear'}
        actions={[
          { id: 'refresh', label: inbox.loading ? 'Refreshing…' : 'Refresh', icon: <Icon.Refresh size={12} />, onSelect: inbox.refresh },
          { id: 'acked', label: showAcked ? 'Back to inbox' : `Acknowledged (${inbox.acknowledged.length})`, onSelect: () => setShowAcked((v) => !v) },
        ]}
      />
      <div className="hb-inbox" tabIndex={0} onKeyDown={onKeyDown} data-testid="inbox-window">
        <div className="hb-inbox-left">
          <RepoField repo={inbox.repo} onSave={inbox.setRepo} />
          {inbox.error ? <p className="hb-inbox-note" data-tone="danger">{inbox.error}</p> : null}
          {inbox.data?.github?.error ? <p className="hb-inbox-note" data-tone="danger">{inbox.data.github.error}</p> : null}
          {inbox.data && inbox.repo && !inbox.data.github?.connected ? <p className="hb-inbox-note">Connect GitHub in the GitHub window to see pull requests here.</p> : null}
          {list.length ? (
            <InboxList groups={groups} items={list} selectedId={selected?.id} activity={fixes.activity} onSelect={setSelectedId} />
          ) : (
            <p className="hb-inbox-note">{showAcked ? 'Nothing acknowledged yet.' : inbox.data ? 'Nothing here. Enjoy it.' : 'Loading…'}</p>
          )}
          <div className="hb-inbox-keys" aria-hidden="true">
            <span><kbd>J</kbd><kbd>K</kbd> move</span><span><kbd>E</kbd> acknowledge</span><span><kbd>U</kbd> undo</span>
          </div>
        </div>
        <InboxDetail
          item={selected}
          act={selected ? fixes.activity[selected.id] : null}
          onFix={fixes.fix}
          onOpen={open}
          onAcknowledge={acknowledge}
          onAnswer={fixes.answer}
        />
        <InboxDock items={inbox.items} dock={inbox.data?.dock} needs={needs} onSelect={(id) => { setShowAcked(false); setSelectedId(id); }} />
        <UndoToast undo={inbox.undo} onUndo={inbox.undoAck} />
      </div>
    </>
  );
}

export default InboxWindow;

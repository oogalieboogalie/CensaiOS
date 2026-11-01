/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from '../WindowTitle.jsx';
import { Icon } from '../../Icons.jsx';
import { SideBySideDiff } from '../../diffViewer/SideBySideDiff.jsx';
import { rowsFromHunks, rowsFromTexts, countRows } from '../../diffViewer/sideBySide.js';
import { windowMeta } from './meta.js';
import { useGitDiff } from './useGitDiff.js';

export { windowMeta };

const PASTE = '';

function Wordmark() {
  return (
    <div className="gdv-mark" aria-label="Git Diff Viewer">
      <span className="gdv-mark-git">GIT</span> <span className="gdv-mark-diff">DIFF</span> <span className="gdv-mark-viewer">VIEWER</span>
    </div>
  );
}

function PasteEditor({ before, after, onChange, onDone }) {
  return (
    <div className="gdv-split gdv-split--edit">
      <label className="gdv-pane gdv-pane--left">
        <span className="gdv-pane-label">Before: paste the old version</span>
        <textarea className="gdv-input" spellCheck={false} value={before} data-testid="gdv-before"
          onChange={(e) => onChange({ diffBefore: e.target.value })} />
      </label>
      <div className="gdv-divider" aria-hidden="true" />
      <label className="gdv-pane gdv-pane--right">
        <span className="gdv-pane-label">After: paste the new version</span>
        <textarea className="gdv-input" spellCheck={false} value={after} data-testid="gdv-after"
          onChange={(e) => onChange({ diffAfter: e.target.value })} />
      </label>
      <button type="button" className="gdv-btn gdv-btn--go" onClick={onDone} disabled={!before && !after} data-testid="gdv-compare">Compare</button>
    </div>
  );
}

/**
 * Git Diff Viewer (diagram 16): a black window with the GIT DIFF VIEWER
 * wordmark and two panes split by a red line. It shows a coding agent's
 * changes from the Agent Console, or any two versions pasted in.
 */
export function GitDiffWindow({ win = {}, onUpdate }) {
  const taskId = win.taskId || PASTE;
  const { tasks, changes, patches, error, refresh } = useGitDiff(taskId);
  const update = (patch) => onUpdate?.(patch);
  const files = changes.files || [];
  const filePath = files.some((f) => f.path === win.filePath) ? win.filePath : files[0]?.path;
  const editing = !taskId && (win.diffEditing ?? !(win.diffBefore || win.diffAfter));

  const rows = React.useMemo(() => {
    if (!taskId) return rowsFromTexts(win.diffBefore || '', win.diffAfter || '');
    const patch = patches.find((p) => p.path === filePath);
    return patch && !patch.binary ? rowsFromHunks(patch.hunks) : [];
  }, [taskId, win.diffBefore, win.diffAfter, patches, filePath]);
  const totals = countRows(rows);
  const file = files.find((f) => f.path === filePath);

  let body;
  // Typing keeps the editor open until Compare; otherwise the first letter in Before would close it.
  if (editing) body = <PasteEditor before={win.diffBefore || ''} after={win.diffAfter || ''} onChange={(patch) => update({ ...patch, diffEditing: true })} onDone={() => update({ diffEditing: false })} />;
  else if (taskId && !changes.loaded) body = <p className="gdv-note">Reading changes…</p>;
  else if (taskId && error) body = <p className="gdv-note" data-tone="danger">{error}</p>;
  else if (taskId && !files.length) body = <p className="gdv-note">This agent has not changed any files yet.</p>;
  else if (taskId && !rows.length) body = <p className="gdv-note">{file?.change === 'deleted' ? 'This file was deleted.' : 'Binary file: nothing to show line by line.'}</p>;
  else body = <SideBySideDiff rows={rows} beforeLabel={taskId ? `Before · ${filePath}` : 'Before'} afterLabel={taskId ? `After · ${filePath}` : 'After'} />;

  return (
    <>
      <WindowTitle
        icon={<Icon.Branch size={14} />}
        label={win.title || windowMeta.label}
        subtitle={`+${totals.add} −${totals.del}`}
        actions={[
          { id: 'refresh', label: 'Refresh', icon: <Icon.Refresh size={12} />, onSelect: refresh },
          ...(!taskId && !editing ? [{ id: 'edit', label: 'Edit texts', onSelect: () => update({ diffEditing: true }) }] : []),
        ]}
      />
      <div className="gdv" data-testid="git-diff-window">
        <Wordmark />
        <div className="gdv-bar">
          <select className="gdv-select" value={taskId} aria-label="What to compare" data-testid="gdv-source"
            onChange={(e) => update({ taskId: e.target.value || null, filePath: null })}>
            <option value={PASTE}>Two versions I paste in</option>
            {tasks.map((t) => <option key={t.id} value={t.id}>Agent: {t.title || t.id}</option>)}
          </select>
          {taskId && files.length > 0 && (
            <div className="gdv-files" role="tablist" aria-label="Changed files">
              {files.map((f) => (
                <button key={f.path} type="button" role="tab" aria-selected={f.path === filePath}
                  className={`gdv-file${f.path === filePath ? ' gdv-file--on' : ''}`} onClick={() => update({ filePath: f.path })}>
                  <span className="gdv-file-name">{f.path.split('/').pop()}</span>
                  <span className="gdv-add">+{f.additions ?? 0}</span><span className="gdv-del">−{f.deletions ?? 0}</span>
                </button>
              ))}
            </div>
          )}
          <span className="gdv-totals"><span className="gdv-add">+{totals.add}</span> <span className="gdv-del">−{totals.del}</span></span>
        </div>
        {body}
      </div>
    </>
  );
}

export default GitDiffWindow;

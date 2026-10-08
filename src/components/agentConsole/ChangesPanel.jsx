/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { parsePatch } from './lineDiff.js';

// Files changed in the task's worktree (git diff against the start commit):
// a file list with +/- counts, then a unified diff per file.

export function ChangesPanel({ changes, onOpenFile }) {
  const parsed = React.useMemo(() => parsePatch(changes.patch || ''), [changes.patch]);
  const [openPath, setOpenPath] = React.useState(null);
  const files = changes.files || [];
  if (!changes.loaded) return <div className="ac-empty">Reading changes…</div>;
  if (files.length === 0) return <div className="ac-empty">No file changes yet.</div>;
  const totals = files.reduce((t, f) => ({ add: t.add + (f.additions || 0), del: t.del + (f.deletions || 0) }), { add: 0, del: 0 });
  return (
    <div className="ac-changes" data-testid="agent-changes">
      <div className="ac-changes-head">
        <span>{files.length} file{files.length === 1 ? '' : 's'} changed</span>
        <span className="ac-num-add">+{totals.add}</span>
        <span className="ac-num-del">-{totals.del}</span>
        {changes.truncated && <span className="ac-muted">diff truncated</span>}
      </div>
      {files.map((file) => {
        const patch = parsed.find((p) => p.path === file.path);
        const open = openPath == null ? files.length <= 3 : openPath === file.path;
        return (
          <section key={file.path} className="ac-file">
            <header className="ac-file-head">
              <button type="button" className="ac-file-toggle" aria-expanded={open} onClick={() => setOpenPath(open ? '' : file.path)}>
                <Icon.Chevron size={11} style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
                <span className={`ac-change ac-change--${file.change}`}>{file.change}</span>
                <span className="ac-file-path">{file.path}</span>
              </button>
              <span className="ac-num-add">+{file.additions ?? 0}</span>
              <span className="ac-num-del">-{file.deletions ?? 0}</span>
              {file.change !== 'deleted' && (
                <button type="button" className="ac-icon-btn" title="Open in Code Editor" aria-label={`Open ${file.path} in Code Editor`} onClick={() => onOpenFile?.(file.path)}>
                  <Icon.OpenWindow size={12} />
                </button>
              )}
            </header>
            {open && patch && !patch.binary && (
              <div className="ac-diff ac-diff--file">
                {patch.hunks.map((hunk, h) => (
                  <React.Fragment key={h}>
                    <div className="ac-diff-hunk">{hunk.header}</div>
                    {hunk.lines.map((line, i) => (
                      <div key={i} className={`ac-diff-line ac-diff-line--${line.type}`}>
                        <span className="ac-diff-sign">{line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}</span>
                        <span className="ac-diff-text">{line.text || ' '}</span>
                      </div>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            )}
            {open && patch?.binary && <div className="ac-empty">Binary file</div>}
          </section>
        );
      })}
    </div>
  );
}

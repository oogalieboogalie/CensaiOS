/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { OFF_BOARD_NOTE } from '../../../shared/files/fileProblems.js';

// A file from a task's worktree that only this computer's owner may read
// (a .env, a key file). It shows here, on the owner's own screen, and never
// opens as a window on the shared board, where everyone would see its words.
export function PrivateFileView({ file, onClose }) {
  return (
    <div className="ac-private" data-testid="agent-private-file">
      <div className="ac-private-head">
        <Icon.Shield size={12} />
        <span className="ac-file-path">{file.path}</span>
        <span className="ac-muted">{OFF_BOARD_NOTE}</span>
        <span className="ac-spacer" />
        <button type="button" className="ac-btn" onClick={onClose}>Close</button>
      </div>
      <pre className="ac-raw">{file.content}</pre>
    </div>
  );
}

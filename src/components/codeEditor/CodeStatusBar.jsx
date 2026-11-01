/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

// The line under the code: how much is there and what language the editor
// thinks it is (where it comes from is in the title already).
export function CodeStatusBar({ code = '', language }) {
  const lines = code ? code.split('\n').length : 0;
  return (
    <div className="hb-ce-status hb-bar" data-testid="code-status">
      <span>{lines} line{lines === 1 ? '' : 's'}</span>
      <span>{code.length} character{code.length === 1 ? '' : 's'}</span>
      <span className="hb-ce-status-spacer" />
      <span className="hb-ce-status-tag">{language}</span>
    </div>
  );
}

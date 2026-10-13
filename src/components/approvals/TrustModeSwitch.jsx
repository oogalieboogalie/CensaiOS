/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

const row = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };

/** The board's Trust mode switch: on = agents act on their own. */
export function TrustModeSwitch({ trust, compact = false }) {
  const disabled = !trust.ready || !trust.canChange || trust.saving;
  return (
    <div style={{ display: 'grid', gap: 4 }} data-testid="trust-mode-switch">
      <label style={{ ...row, cursor: disabled ? 'default' : 'pointer', fontWeight: 650, color: 'var(--ink)',
        fontSize: compact ? 'var(--text-xs)' : undefined }}>
        <input type="checkbox" role="switch" aria-label="Trust mode" checked={trust.board}
          disabled={disabled} onChange={event => trust.setBoard(event.target.checked)} />
        Trust mode {trust.board ? 'on' : 'off'}
      </label>
      {!compact && (
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', lineHeight: 1.5 }}>
          {trust.board
            ? 'Agents act on their own: edits to files, the board, designs, PDFs and CAD parts happen without your OK.'
            : 'Agents ask first: each change waits in Action Approvals until an owner or admin says OK.'}
        </p>
      )}
      {trust.ready && !trust.canChange && (
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>Only the board's owner or an admin can change this.</p>
      )}
      {trust.error && <p role="alert" style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--danger)' }}>{trust.error}</p>}
    </div>
  );
}

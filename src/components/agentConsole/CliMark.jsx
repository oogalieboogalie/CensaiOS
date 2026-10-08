/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

// Each CLI gets a plain monogram tile, no logos or emoji: the board stays
// one visual language and no vendor brand is borrowed.
export const CLI_MONOGRAM = { claudecode: 'CC', codex: 'CX', gemini: 'GM', opencode: 'OC' };

export function CliMark({ cli, size = 'md', active = false }) {
  return (
    <span className={`ac-mark ac-mark--${size}${active ? ' ac-mark--active' : ''}`} aria-hidden="true">
      {CLI_MONOGRAM[cli] || '··'}
    </span>
  );
}

const STATE_LABEL = {
  not_installed: 'Not installed',
  installing: 'Installing',
  idle: 'Idle',
  running: 'Running',
  needs_approval: 'Needs approval',
  starting: 'Starting',
  done: 'Done',
  failed: 'Failed',
  stopped: 'Stopped',
};

const STATE_TONE = {
  not_installed: 'off', installing: 'busy', idle: 'ok', running: 'busy', needs_approval: 'warn',
  starting: 'busy', done: 'ok', failed: 'danger', stopped: 'off',
};

export function stateLabel(state) {
  return STATE_LABEL[state] || state;
}

export function StatusDot({ state }) {
  const tone = STATE_TONE[state] || 'off';
  return <span className={`ac-dot ac-dot--${tone}${tone === 'busy' || tone === 'warn' ? ' ac-dot--pulse' : ''}`} aria-hidden="true" />;
}

/** Status chip per CLI: version · signed in · running / idle / needs approval. */
export function CliStatusChip({ cli }) {
  if (!cli) return null;
  const signed = cli.signedIn ? `Signed in${cli.signedInVia === 'cli-login' ? ' (CLI login)' : cli.signedInVia === 'vault' ? ' (key vault)' : ''}` : 'Not signed in';
  return (
    <span className="ac-chip" data-testid={`cli-chip-${cli.id}`} title={cli.gateNote}>
      <StatusDot state={cli.state} />
      <span>{stateLabel(cli.state)}</span>
      {cli.installed && cli.version && <span className="ac-chip-meta">v{cli.version}</span>}
      {cli.installed && <span className={`ac-chip-meta${cli.signedIn ? '' : ' ac-chip-meta--warn'}`}>{signed}</span>}
    </span>
  );
}

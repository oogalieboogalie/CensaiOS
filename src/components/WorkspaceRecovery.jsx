import React from 'react';
import { api } from '../lib/api.js';

const buttonStyle = {
  all: 'unset', cursor: 'pointer', padding: '9px 14px', borderRadius: 'var(--radius-lg)',
  background: 'var(--accent)', color: 'var(--accent-contrast)', fontSize: 'var(--text-sm)', fontWeight: 700,
};

function RecoveryShell({ eyebrow, title, detail, children, error }) {
  return <div style={{ position: 'fixed', inset: 0, background: 'var(--canvas)', display: 'grid', placeItems: 'center', padding: 24 }}>
    <section role="alert" style={{ width: 'min(520px, 100%)', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-pop)', padding: 28 }}>
      <div style={{ fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', letterSpacing: 'var(--label-tracking)', textTransform: 'var(--label-case)', color: 'var(--accent-text)', marginBottom: 10 }}>{eyebrow}</div>
      <h1 style={{ margin: 0, fontSize: 'var(--text-xl)', lineHeight: 1.2, color: 'var(--ink)' }}>{title}</h1>
      <p style={{ margin: '10px 0 20px', fontSize: 'var(--text-md)', lineHeight: 1.6, color: 'var(--ink-soft)' }}>{detail}</p>
      {error && <p style={{ padding: 10, borderRadius: 'var(--radius-lg)', background: 'var(--surface-2)', color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>{error}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{children}</div>
    </section>
  </div>;
}

export function WorkspaceRecovery({ load, onRetry }) {
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState('');
  const cached = load.draft?.value ?? load.value ?? load.cachedValue;

  const saveChoice = async (value) => {
    setBusy(true);
    setActionError('');
    try {
      await api.saveWorkspace(value, load.revision || 0);
      onRetry();
    } catch (error) {
      setActionError(error.message || 'The workspace choice could not be saved.');
      setBusy(false);
    }
  };

  if (load.status === 'restore_required') {
    return <RecoveryShell eyebrow="Recovery copy found" title="Choose what becomes authoritative" detail="The server has no canvas document, but this browser has a recovery copy. Nothing will be imported or discarded without your choice." error={actionError}>
      <button disabled={busy} style={buttonStyle} onClick={() => saveChoice(cached)}>{busy ? 'Restoring…' : 'Restore recovery copy'}</button>
      <button disabled={busy} style={{ ...buttonStyle, background: 'var(--surface-2)', color: 'var(--ink)' }} onClick={() => saveChoice({})}>Start with an empty canvas</button>
      <button style={{ ...buttonStyle, background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--hairline)' }} onClick={() => api.downloadWorkspaceSnapshot(cached)}>Download copy</button>
    </RecoveryShell>;
  }

  if (load.status === 'draft_required') {
    return <RecoveryShell eyebrow="Unsaved draft found" title="A prior save did not finish" detail="The server copy is intact and a newer browser draft was preserved separately. Choose which version to keep." error={actionError}>
      <button disabled={busy} style={buttonStyle} onClick={() => saveChoice(load.draft.value)}>{busy ? 'Restoring…' : 'Restore draft to server'}</button>
      <button disabled={busy} style={{ ...buttonStyle, background: 'var(--surface-2)', color: 'var(--ink)' }} onClick={() => { api.clearWorkspaceDraft(load.workspaceId); onRetry(); }}>Use server copy</button>
      <button style={{ ...buttonStyle, background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--hairline)' }} onClick={() => api.downloadWorkspaceSnapshot(load.draft.value, 'draft')}>Download draft</button>
    </RecoveryShell>;
  }

  return <RecoveryShell eyebrow="Workspace protected" title="The server did not answer" detail="Censai did not initialize or overwrite your canvas. Retry when the workspace server is available, or download the browser recovery copy now." error={actionError || load.error?.message}>
    <button style={buttonStyle} onClick={onRetry}>Try again</button>
    {cached && <button style={{ ...buttonStyle, background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--hairline)' }} onClick={() => api.downloadWorkspaceSnapshot(cached)}>Download recovery copy</button>}
  </RecoveryShell>;
}

export function PersistencePill({ persistence }) {
  const { status, error, retry, download } = persistence;
  if (status !== 'degraded' && status !== 'conflict') return null;
  const isConflict = status === 'conflict';
  return (
    <div
      role="status"
      style={{
        position: 'fixed', top: 56, right: 12, zIndex: 200,
        display: 'flex', alignItems: 'center', gap: 8,
        maxWidth: 'min(420px, calc(100vw - 24px))',
        background: 'color-mix(in oklab, var(--surface) 92%, transparent)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--hairline)', borderRadius: 'var(--radius-full)',
        boxShadow: 'var(--shadow-card)',
        padding: '7px 8px 7px 12px',
        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--ink-soft)',
      }}
    >
      <span
        style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: isConflict ? 'var(--ps-red)' : 'var(--ps-green)',
        }}
      />
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {isConflict ? 'Workspace changed elsewhere' : (error || 'Could not reach server · retrying — draft kept locally')}
      </span>
      {!isConflict && (
        <button type="button" onClick={retry} style={{ all: 'unset', cursor: 'pointer', padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontSize: 'var(--text-xs)', fontWeight: 700, flexShrink: 0 }}>
          Retry now
        </button>
      )}
      {isConflict && (
        <button type="button" onClick={() => window.location.reload()} style={{ all: 'unset', cursor: 'pointer', padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontSize: 'var(--text-xs)', fontWeight: 700, flexShrink: 0 }}>
          Reload server copy
        </button>
      )}
      <button type="button" onClick={download} style={{ all: 'unset', cursor: 'pointer', padding: '4px 10px', borderRadius: 'var(--radius-full)', border: '1px solid var(--hairline)', color: 'var(--ink-soft)', fontSize: 'var(--text-xs)', fontWeight: 600, flexShrink: 0 }}>
        Download
      </button>
    </div>
  );
}

const draftButton = {
  all: 'unset', cursor: 'pointer', padding: '4px 10px', borderRadius: 'var(--radius-full)',
  fontSize: 'var(--text-xs)', fontWeight: 600, flexShrink: 0,
};

/**
 * Offers back a board's changes that did not reach the server before the
 * last visit ended. The whole sentence always shows: on a narrow window the
 * buttons drop below it instead of cutting it off.
 */
export function DraftRestoreBar({ savedAt, onRestore, onDownload, onDiscard }) {
  return (
    <div
      role="status" data-present-hide data-testid="draft-restore-bar"
      style={{
        position: 'fixed', top: 56, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8,
        width: 'max-content', maxWidth: 'calc(100vw - 24px)', boxSizing: 'border-box',
        background: 'color-mix(in oklab, var(--surface) 92%, transparent)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--hairline)', borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-card)',
        padding: '7px 8px 7px 14px',
        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', lineHeight: 1.4, color: 'var(--ink-soft)',
      }}
    >
      <span style={{ flex: '1 1 240px', minWidth: 0 }}>
        Your changes{savedAt ? ` from ${savedAt}` : ''} did not reach the server. This browser kept a copy.
      </span>
      <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button type="button" onClick={onRestore} style={{ ...draftButton, background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontWeight: 700 }}>
          Restore them
        </button>
        <button type="button" onClick={onDownload} style={{ ...draftButton, border: '1px solid var(--hairline)', color: 'var(--ink-soft)' }}>
          Download
        </button>
        <button type="button" onClick={onDiscard} style={{ ...draftButton, color: 'var(--ink-faint)' }}>
          Discard
        </button>
      </span>
    </div>
  );
}

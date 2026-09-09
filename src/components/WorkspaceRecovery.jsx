import React from 'react';
import { api } from '../lib/api.js';

const buttonStyle = {
  all: 'unset', cursor: 'pointer', padding: '9px 14px', borderRadius: 8,
  background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 12, fontWeight: 700,
};

function RecoveryShell({ eyebrow, title, detail, children, error }) {
  return <div style={{ position: 'fixed', inset: 0, background: 'var(--canvas)', display: 'grid', placeItems: 'center', padding: 24 }}>
    <section role="alert" style={{ width: 'min(520px, 100%)', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 18, boxShadow: 'var(--shadow-pop)', padding: 28 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 10 }}>{eyebrow}</div>
      <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.2, color: 'var(--ink)' }}>{title}</h1>
      <p style={{ margin: '10px 0 20px', fontSize: 13, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{detail}</p>
      {error && <p style={{ padding: 10, borderRadius: 8, background: 'var(--surface-2)', color: 'var(--danger)', fontSize: 11 }}>{error}</p>}
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
      <button disabled={busy} style={{ ...buttonStyle, background: 'var(--surface-2)', color: 'var(--ink)' }} onClick={() => { api.clearWorkspaceDraft(); onRetry(); }}>Use server copy</button>
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
        border: '1px solid var(--hairline)', borderRadius: 999,
        boxShadow: 'var(--shadow-card)',
        padding: '7px 8px 7px 12px',
        fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)',
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
        <button type="button" onClick={retry} style={{ all: 'unset', cursor: 'pointer', padding: '4px 10px', borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
          Retry now
        </button>
      )}
      {isConflict && (
        <button type="button" onClick={() => window.location.reload()} style={{ all: 'unset', cursor: 'pointer', padding: '4px 10px', borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
          Reload server copy
        </button>
      )}
      <button type="button" onClick={download} style={{ all: 'unset', cursor: 'pointer', padding: '4px 10px', borderRadius: 999, border: '1px solid var(--hairline)', color: 'var(--ink-soft)', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
        Download
      </button>
    </div>
  );
}

export function DraftRestoreBar({ savedAt, onRestore, onDownload, onDiscard }) {
  return (
    <div
      role="status"
      style={{
        position: 'fixed', top: 56, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
        display: 'flex', alignItems: 'center', gap: 8,
        maxWidth: 'min(560px, calc(100vw - 24px))',
        background: 'color-mix(in oklab, var(--surface) 92%, transparent)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--hairline)', borderRadius: 999,
        boxShadow: 'var(--shadow-card)',
        padding: '7px 8px 7px 12px',
        fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)',
      }}
    >
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        A newer unsaved draft{savedAt ? ` from ${savedAt}` : ''} is kept in this browser.
      </span>
      <button type="button" onClick={onRestore} style={{ all: 'unset', cursor: 'pointer', padding: '4px 10px', borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
        Restore draft
      </button>
      <button type="button" onClick={onDownload} style={{ all: 'unset', cursor: 'pointer', padding: '4px 10px', borderRadius: 999, border: '1px solid var(--hairline)', color: 'var(--ink-soft)', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
        Download
      </button>
      <button type="button" onClick={onDiscard} style={{ all: 'unset', cursor: 'pointer', padding: '4px 10px', borderRadius: 999, color: 'var(--ink-faint)', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
        Discard
      </button>
    </div>
  );
}

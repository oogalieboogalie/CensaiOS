import React from 'react';
import { api } from '../../lib/api.js';

// The bottom of a Files window: save versions of the project and send them
// to GitHub as a pull request, without leaving the board. Polls the
// folder's status so files an agent or a terminal just wrote show up in the
// tree (onChanged) and the "unsaved changes" count stays true.

const POLL_MS = 5000;

const bar = { borderTop: '1px solid var(--hairline)', padding: '8px 10px', display: 'grid', gap: 6, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', background: 'var(--surface-1)' };
const btn = { all: 'unset', cursor: 'pointer', padding: '4px 9px', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: 'var(--ink)', fontWeight: 600, fontSize: 'var(--text-xs)' };
const primary = { ...btn, background: 'var(--accent)', color: 'var(--accent-contrast)', border: '1px solid var(--accent-line)' };
const field = { all: 'unset', flex: 1, minWidth: 0, border: '1px solid var(--hairline)', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', padding: '4px 8px', color: 'var(--ink)', fontSize: 'var(--text-xs)' };

function changeWords(n) {
  if (!n) return 'Everything is saved';
  return n === 1 ? '1 unsaved change' : `${n} unsaved changes`;
}

export function ProjectVersions({ dirPath, onChanged, onSpawn }) {
  const [status, setStatus] = React.useState(null);
  const [form, setForm] = React.useState(null); // 'save' | 'send'
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [sent, setSent] = React.useState(null);
  const signature = React.useRef('');

  const refresh = React.useCallback(async () => {
    try {
      const next = await api.projectVersionStatus(dirPath);
      setStatus(next);
      const sig = JSON.stringify((next.changes || []).map((c) => `${c.status}:${c.file}`));
      if (signature.current && sig !== signature.current) onChanged?.();
      signature.current = sig;
    } catch (err) {
      setStatus({ unavailable: err.message });
    }
  }, [dirPath, onChanged]);

  React.useEffect(() => {
    signature.current = '';
    setSent(null);
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      const result = await fn();
      if (result?.status) setStatus(result.status);
      else if (result?.tracked !== undefined) setStatus(result);
      setForm(null);
      setText('');
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  if (!status || status.unavailable) return null;
  const stop = (e) => e.stopPropagation();

  if (!status.tracked) {
    return (
      <div style={bar} data-testid="project-versions" onPointerDown={stop}>
        <div>Versions are off for this folder. Turn them on to save your work and send it to GitHub.</div>
        <div><button style={primary} disabled={busy} onClick={() => run(() => api.startProjectVersions(dirPath))}>Start saving versions</button></div>
        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
      </div>
    );
  }

  const changes = status.changes || [];
  const last = status.versions?.[0];
  const submit = async () => {
    if (form === 'save') {
      await run(() => api.saveProjectVersion(dirPath, text));
    } else {
      const result = await run(() => api.sendProjectToGithub(dirPath, text));
      if (result) setSent(result);
    }
  };

  return (
    <div style={bar} data-testid="project-versions" onPointerDown={stop}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span data-testid="project-versions-changes" style={{ color: changes.length ? 'var(--ink)' : 'var(--ink-faint)', fontWeight: 600 }}>
          {changeWords(changes.length)}
        </span>
        {status.partOfBigger && <span title={status.root}>saved with the whole project</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button style={btn} disabled={busy || !changes.length} onClick={() => { setForm(form === 'save' ? null : 'save'); setText(''); }}
            title={changes.length ? 'Save every change as one version you can go back to' : 'Nothing to save yet'}>Save a version</button>
          <button style={btn} disabled={busy} onClick={() => { setForm(form === 'send' ? null : 'send'); setText(''); }}
            title={status.githubRepo ? `Open a pull request on ${status.githubRepo}` : 'Make a private GitHub repository for this project and send it there'}>Send to GitHub</button>
        </span>
      </div>
      {changes.length > 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', maxHeight: 54, overflow: 'auto' }}>
          {changes.slice(0, 8).map((c) => <div key={c.file}>{c.status} · {c.file}</div>)}
          {changes.length > 8 && <div>and {changes.length - 8} more</div>}
        </div>
      )}
      {form && (
        <div style={{ display: 'flex', gap: 6 }}>
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} style={field}
            data-testid="project-versions-text"
            placeholder={form === 'save' ? 'What changed? (for example: added the lead form)' : 'Name this change for the review'}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setForm(null); }} />
          <button style={primary} disabled={busy} onClick={submit} data-testid="project-versions-go">
            {busy ? 'Working...' : form === 'save' ? 'Save' : 'Send'}
          </button>
        </div>
      )}
      {form === 'send' && !status.githubRepo && (
        <div>This makes a private repository on your GitHub account and sends every saved version there.</div>
      )}
      {error && <div style={{ color: 'var(--danger)' }} data-testid="project-versions-error">{error}</div>}
      {sent && (
        <div data-testid="project-versions-sent" style={{ color: 'var(--accent-ink)' }}>
          {sent.kind === 'pull-request' ? `Pull request #${sent.number} is open on ${sent.repo}. ` : `Your project is on GitHub at ${sent.repo} (private). `}
          <button style={{ ...btn, padding: '2px 7px' }} onClick={() => onSpawn?.('browser', { url: sent.url, title: sent.repo })}>Open it on the board</button>
        </div>
      )}
      {last && (
        <div style={{ color: 'var(--ink-faint)' }} data-testid="project-versions-last">
          Last saved {last.when}: {last.message}
          {status.githubRepo && status.unsent ? ` · ${status.unsent} not on the main branch yet` : ''}
        </div>
      )}
    </div>
  );
}

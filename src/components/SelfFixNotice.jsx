/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { selfFixApi } from '../lib/selfFix/api.js';
import { DEMO } from '../lib/demo/demoMode.js';

const CHECK_EVERY_MS = 60_000;

const box = {
  position: 'fixed', right: 16, bottom: 16, zIndex: 1200, width: 320, padding: 12,
  background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-xl)',
  boxShadow: 'var(--elevation-2)', fontSize: 'var(--text-sm)', color: 'var(--ink)', display: 'grid', gap: 6,
};
const button = { all: 'unset', cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 650, padding: '4px 10px', borderRadius: 'var(--radius-md)' };

/**
 * Self-fix: a quiet corner note when a fix is ready ("goes in next start")
 * or went in. Only the computer's owner sees it; one note at a time.
 */
export function SelfFixNotice() {
  const [notice, setNotice] = React.useState(null);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (DEMO) return undefined;
    let stopped = false;
    let timer = null;
    const check = () => selfFixApi.notices()
      .then((data) => { if (!stopped) setNotice(data.notices?.[0] || null); })
      .catch((err) => { if (err.status === 403 || err.status === 401) stopped = true; })
      .finally(() => { if (!stopped) timer = setTimeout(check, CHECK_EVERY_MS); });
    timer = setTimeout(check, 4000);
    return () => { stopped = true; clearTimeout(timer); };
  }, []);

  if (!notice) return null;
  const done = (fn) => fn().then(() => setNotice(null)).catch((err) => setError(err.message));
  const what = notice.summary || notice.title;
  return (
    <div role="status" style={box} data-testid="self-fix-notice" data-status={notice.status}>
      <strong>{notice.status === 'ready' ? 'A bug was fixed' : 'Fix is in'}</strong>
      <span style={{ color: 'var(--ink-soft)' }}>
        {notice.status === 'ready' ? `${what} It goes in the next time you restart censaiOS.` : `${what} This is in now.`}
      </span>
      {error && <span role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>{error}</span>}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button type="button" style={{ ...button, color: 'var(--ink-soft)' }} onClick={() => done(() => selfFixApi.undo(notice.id))}>Undo</button>
        <button type="button" style={{ ...button, background: 'var(--accent-soft)', color: 'var(--ink)' }} onClick={() => done(() => selfFixApi.seen(notice.id, notice.status))}>OK</button>
      </div>
    </div>
  );
}

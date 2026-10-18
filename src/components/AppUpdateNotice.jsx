/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { appUpdateApi, changeCount } from '../lib/appUpdate/api.js';
import { DEMO } from '../lib/demo/demoMode.js';
import { TRAY_UPDATE_EVENT } from '../lib/appUpdate/trayFlow.js';

// The tray's Update panel sits next to this note in AppContent.
export { TrayUpdatePanel } from './TrayUpdatePanel.jsx';

const CHECK_EVERY_MS = 60_000;
const WAIT_EVERY_MS = 3_000;
const GIVE_UP_MS = 15 * 60_000;

const box = {
  position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1200,
  width: 'min(420px, calc(100vw - 32px))', padding: 12, display: 'grid', gap: 6,
  background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-xl)',
  boxShadow: 'var(--elevation-2)', fontSize: 'var(--text-sm)', color: 'var(--ink)',
};
const button = { all: 'unset', cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 650, padding: '4px 10px', borderRadius: 'var(--radius-md)' };

/**
 * "Update ready" note: the PC's updater (scripts/auto-update.ps1) pulled and
 * built a newer censaiOS in the background. Restart swaps it in and the page
 * reloads by itself once the new copy answers. Only the owner sees it.
 */
export function AppUpdateNotice() {
  const [status, setStatus] = React.useState(null);
  const [phase, setPhase] = React.useState('idle'); // idle | restarting | hidden
  const [error, setError] = React.useState('');
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (DEMO) return undefined;
    let stopped = false;
    let timer = null;
    const check = () => appUpdateApi.status()
      .then((data) => { if (!stopped) setStatus(data); })
      .catch((err) => { if ([401, 403, 404].includes(err.status)) stopped = true; })
      .finally(() => { if (!stopped) timer = setTimeout(check, CHECK_EVERY_MS); });
    timer = setTimeout(check, 5000);
    return () => { stopped = true; clearTimeout(timer); };
  }, []);

  // The tray's Update panel takes over; one note at a time.
  React.useEffect(() => {
    const hide = () => setPhase('hidden');
    window.addEventListener(TRAY_UPDATE_EVENT, hide);
    return () => window.removeEventListener(TRAY_UPDATE_EVENT, hide);
  }, []);

  // After Restart: wait until the new copy answers, then reload into it.
  React.useEffect(() => {
    if (phase !== 'restarting' || !status?.ready) return undefined;
    const want = status.ready.commit;
    let stopped = false;
    let timer = null;
    // While the app swaps over the calls fail; keep asking until it is back.
    const wait = () => appUpdateApi.status()
      .then((data) => { if (data.running === want) window.location.reload(); })
      .catch(() => {})
      .finally(() => { if (!stopped) timer = setTimeout(wait, WAIT_EVERY_MS); });
    timer = setTimeout(wait, WAIT_EVERY_MS);
    const giveUp = setTimeout(() => {
      stopped = true;
      clearTimeout(timer);
      setPhase('idle');
      setError('The update is taking longer than expected. Close censaiOS and open it again.');
    }, GIVE_UP_MS);
    return () => { stopped = true; clearTimeout(timer); clearTimeout(giveUp); };
  }, [phase, status]);

  if (!status?.ready || phase === 'hidden') return null;
  const count = changeCount(status.ready.changes);
  const restart = () => {
    setError('');
    appUpdateApi.restart().then(() => setPhase('restarting')).catch((err) => setError(err.message));
  };

  return (
    <div role="status" style={box} data-testid="app-update-notice" data-phase={phase}>
      <strong>{phase === 'restarting' ? 'Updating censaiOS…' : 'Update ready'}</strong>
      <span style={{ color: 'var(--ink-soft)' }}>
        {phase === 'restarting'
          ? 'This takes a few seconds. The board comes back by itself.'
          : `A newer censaiOS is downloaded${count ? ` (${count})` : ''}. Restart to use it, or it goes in the next time you open censaiOS.`}
      </span>
      {open && status.ready.changes.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--ink-soft)', fontSize: 'var(--text-xs)', maxHeight: 160, overflow: 'auto' }}>
          {status.ready.changes.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      )}
      {error && <span role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>{error}</span>}
      {phase !== 'restarting' && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {status.ready.changes.length > 0 && (
            <button type="button" style={{ ...button, color: 'var(--ink-soft)' }} onClick={() => setOpen((v) => !v)}>
              {open ? 'Hide changes' : "What's new"}
            </button>
          )}
          <button type="button" style={{ ...button, color: 'var(--ink-soft)' }} onClick={() => setPhase('hidden')}>Later</button>
          {status.watching && (
            <button type="button" style={{ ...button, background: 'var(--accent-soft)', color: 'var(--ink)' }} onClick={restart}>Restart now</button>
          )}
        </div>
      )}
    </div>
  );
}

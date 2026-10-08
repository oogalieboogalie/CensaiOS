import React from 'react';
import { createPortal } from 'react-dom';
import { glossButton, glossContainer } from '../../lib/theme/gloss.js';
import { Icon } from '../Icons.jsx';

// Host Status lives in the top-right tray (Chrome.jsx renders the slot) so it
// never covers windows. "Float" brings back the old card on the canvas.
export const STATUS_TRAY_ID = 'hb-status-tray';
const PLACEMENT_KEY = 'host-status-placement';
const linkButton = { all: 'unset', cursor: 'pointer', color: 'var(--ink-faint)', fontSize: 'var(--text-xs)', padding: '2px 4px', borderRadius: 'var(--radius-sm)' };

function bytesToHuman(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

function StatusDetails({ status, error }) {
  return (
    <>
    {error && <div style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>Error: {error}</div>}
    {status?.host ? (
      <div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-xs)' }}>Uptime</div>
          <div style={{ fontWeight: 600 }}>{status.host.uptime_human}</div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-xs)' }}>Memory</div>
          {(() => {
            const used = status.host.total_mem - status.host.free_mem;
            const pct = Math.round((used / status.host.total_mem) * 100);
            return (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 600 }}>{bytesToHuman(used)} / {bytesToHuman(status.host.total_mem)}</div>
                  <div style={{ color: 'var(--ink-faint)' }}>{pct}%</div>
                </div>
                <div style={{ background: 'color-mix(in oklab, var(--color-black) 6%, transparent)', height: 8, borderRadius: 'var(--radius-md)', marginTop: 6 }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 'var(--radius-md)' }} />
                </div>
              </div>
            );
          })()}
        </div>

        <div style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-xs)', marginBottom: 6 }}>Containers</div>
        <div style={{ maxHeight: 180, overflow: 'auto' }}>
          {Array.isArray(status.containers) ? status.containers.slice(0, 8).map(c => (
            <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid color-mix(in oklab, var(--color-black) 4%, transparent)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>{c.status} {c.ports ? `· ${c.ports}` : ''}</div>
              </div>
              <div style={{ textAlign: 'right', marginLeft: 8, width: 80 }}>
                <div style={{ fontSize: 'var(--text-sm)' }}>{c.cpu || '—'}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)' }}>{c.mem || '—'}</div>
              </div>
            </div>
          )) : <div style={{ color: 'var(--ink-faint)' }}>No container data</div>}
        </div>
      </div>
    ) : (
      <div style={{ color: 'var(--ink-faint)' }}>Loading...</div>
    )}
    </>
  );
}

function memoryPct(status) {
  if (!status?.host?.total_mem) return null;
  return Math.round(((status.host.total_mem - status.host.free_mem) / status.host.total_mem) * 100);
}

export function SystemStatusWidget({ focusMode }) {
  const [status, setStatus] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [placement, setPlacementState] = React.useState(() => {
    try { return window.localStorage.getItem(PLACEMENT_KEY) === 'float' ? 'float' : 'tray'; } catch { return 'tray'; }
  });
  const [open, setOpen] = React.useState(false);
  const [trayEl, setTrayEl] = React.useState(null);
  const panelRef = React.useRef(null);

  async function fetchStatus() {
    try {
      const res = await fetch('/api/system/status');
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const j = await res.json();
      setStatus(j);
      setError(null);
    } catch (err) {
      setError(String(err));
      setStatus(null);
    }
  }

  React.useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 10_000);
    return () => clearInterval(id);
  }, []);
  React.useEffect(() => { setTrayEl(document.getElementById(STATUS_TRAY_ID)); }, [focusMode, placement]);
  React.useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target) || trayEl?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, trayEl]);

  if (focusMode) return null;

  const setPlacement = (next) => {
    try { window.localStorage.setItem(PLACEMENT_KEY, next); } catch {}
    setPlacementState(next);
    setOpen(false);
  };
  const pct = memoryPct(status);
  const time = status?.now ? new Date(status.now).toLocaleTimeString() : '';
  const header = (action) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
      <strong>Host status</strong>
      <small style={{ color: 'var(--ink-faint)', marginLeft: 'auto' }}>{time}</small>
      {action}
    </div>
  );

  if (placement === 'float') {
    return (
      <div data-testid="host-status-float" style={glossContainer({ position: 'fixed', top: 80, right: 16, width: 320, color: 'var(--ink)', borderRadius: 'var(--radius-float)', padding: 12, fontSize: 'var(--text-sm)', zIndex: 1200 })}>
        {header(<button type="button" onClick={() => setPlacement('tray')} title="Dock host status into the tray" style={linkButton}>Dock</button>)}
        <StatusDetails status={status} error={error} />
      </div>
    );
  }
  if (!trayEl) return null;
  return createPortal(
    <>
      <button type="button" data-testid="host-status-chip" onClick={() => setOpen(o => !o)} aria-expanded={open}
        title={error ? `Host status: ${error}` : 'Host status'}
        style={{ all: 'unset', ...glossButton({ cursor: 'pointer', height: 26, padding: '0 8px', borderRadius: 'var(--radius-float-btn)', display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink-soft)', fontSize: 'var(--text-xs)', fontVariantNumeric: 'tabular-nums' }) }}>
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 'var(--radius-full)', background: error ? 'var(--danger)' : (status ? 'var(--success)' : 'var(--ink-faint)') }} />
        <Icon.Monitor size={13} />
        {pct !== null && <span>{pct}%</span>}
      </button>
      {open && (
        <div ref={panelRef} data-testid="host-status-panel" role="dialog" aria-label="Host status"
          style={glossContainer({ position: 'fixed', top: 52, right: 12, width: 300, color: 'var(--ink)', borderRadius: 'var(--radius-float)', padding: 12, fontSize: 'var(--text-sm)', zIndex: 1200, textAlign: 'left' })}>
          {header(<button type="button" onClick={() => setPlacement('float')} title="Float host status on the canvas" style={linkButton}>Float</button>)}
          <StatusDetails status={status} error={error} />
        </div>
      )}
    </>,
    trayEl,
  );
}

export default SystemStatusWidget;

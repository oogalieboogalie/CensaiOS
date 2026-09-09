import React from 'react';

function bytesToHuman(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

export function SystemStatusWidget({ focusMode }) {
  const [status, setStatus] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [minimized, setMinimized] = React.useState(() => {
    try { return window.localStorage.getItem('host-status-min') === '1'; } catch { return false; }
  });

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

  if (focusMode) return null;

  const toggleMin = () => {
    setMinimized(m => {
      try { window.localStorage.setItem('host-status-min', m ? '0' : '1'); } catch {}
      return !m;
    });
  };

  return (
    <div style={{ position: 'fixed', top: 80, right: 16, width: minimized ? 'auto' : 320, background: 'var(--surface)', color: 'var(--ink)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', padding: minimized ? '6px 10px' : 12, fontSize: 12, zIndex: 1200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: minimized ? 0 : 8, gap: 8 }}>
        <strong>Host Status</strong>
        {!minimized && <small style={{ color: 'var(--ink-faint)' }}>{status?.now ? new Date(status.now).toLocaleTimeString() : ''}</small>}
        <button
          onClick={toggleMin}
          title={minimized ? 'Expand host status' : 'Minimize host status'}
          style={{ all: 'unset', cursor: 'pointer', color: 'var(--ink-faint)', fontSize: 13, lineHeight: 1, padding: '0 2px' }}
        >
          {minimized ? '+' : '−'}
        </button>
      </div>
      {minimized ? null : (<>
      {error && <div style={{ color: 'var(--accent)', fontSize: 12 }}>Error: {error}</div>}
      {status ? (
        <div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ color: 'var(--ink-faint)', fontSize: 11 }}>Uptime</div>
            <div style={{ fontWeight: 600 }}>{status.host.uptime_human}</div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ color: 'var(--ink-faint)', fontSize: 11 }}>Memory</div>
            {(() => {
              const used = status.host.total_mem - status.host.free_mem;
              const pct = Math.round((used / status.host.total_mem) * 100);
              return (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 600 }}>{bytesToHuman(used)} / {bytesToHuman(status.host.total_mem)}</div>
                    <div style={{ color: 'var(--ink-faint)' }}>{pct}%</div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.06)', height: 8, borderRadius: 6, marginTop: 6 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 6 }} />
                  </div>
                </div>
              );
            })()}
          </div>

          <div style={{ color: 'var(--ink-faint)', fontSize: 11, marginBottom: 6 }}>Containers</div>
          <div style={{ maxHeight: 180, overflow: 'auto' }}>
            {Array.isArray(status.containers) ? status.containers.slice(0, 8).map(c => (
              <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{c.status} {c.ports ? `· ${c.ports}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right', marginLeft: 8, width: 80 }}>
                  <div style={{ fontSize: 12 }}>{c.cpu || '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{c.mem || '—'}</div>
                </div>
              </div>
            )) : <div style={{ color: 'var(--ink-faint)' }}>No container data</div>}
          </div>
        </div>
      ) : (
        <div style={{ color: 'var(--ink-faint)' }}>Loading...</div>
      )}
      </>)}
    </div>
  );
}

export default SystemStatusWidget;

import React, { useState, useEffect } from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { useVisibilityAwareInterval } from '../lib/usePolling.js';

export function ContainersWindow({ win, onUpdate }) {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState({});
  const [restarting, setRestarting] = useState({});
  const [removing, setRemoving] = useState({});

  const fetchContainers = async () => {
    try {
      const res = await fetch('/api/containers');
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch containers');
      }
      const data = await res.json();
      setContainers(Array.isArray(data.containers) ? data.containers : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContainers();
  }, []);

  useVisibilityAwareInterval(fetchContainers, 5000);

  const handleLogs = async (service) => {
    try {
      const res = await fetch(`/api/containers/${encodeURIComponent(service)}/logs`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Failed to fetch logs for ${service}`);
      }
      const data = await res.json();
      setLogs((prev) => ({ ...prev, [service]: data.logs }));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRestart = async (service) => {
    setRestarting((prev) => ({ ...prev, [service]: true }));
    try {
      const res = await fetch(`/api/containers/${encodeURIComponent(service)}/restart`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Failed to restart ${service}`);
      }
      await fetchContainers();
    } catch (err) {
      alert(err.message);
    } finally {
      setRestarting((prev) => ({ ...prev, [service]: false }));
    }
  };

  const handleRemove = async (service) => {
    if (!window.confirm(`Remove container "${service}"? A sandbox will be recreated on next use.`)) return;
    setRemoving((prev) => ({ ...prev, [service]: true }));
    try {
      const res = await fetch(`/api/containers/${encodeURIComponent(service)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Failed to remove ${service}`);
      }
      await fetchContainers();
    } catch (err) {
      alert(err.message);
    } finally {
      setRemoving((prev) => ({ ...prev, [service]: false }));
    }
  };

  const renderContent = () => {
    if (loading && containers.length === 0) {
      return <div style={{ padding: 14, color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>Loading containers...</div>;
    }
    if (error) {
      return <div style={{ padding: 14, color: 'var(--ps-red)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>Error: {error}</div>;
    }
    if (containers.length === 0) {
      return <div style={{ padding: 14, color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>No containers found.</div>;
    }

    return (
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {containers.map((c, i) => {
          const svc = c.Service || c.Name || c.service || 'unknown';
          const status = c.Status || c.State || 'unknown';
          const ports = Array.isArray(c.Publishers)
            ? c.Publishers.map((p) => `${p.PublishedPort || ''}→${p.TargetPort || ''}`).join(', ')
            : (c.Ports || '');
          const isRunning = status.toLowerCase().includes('up') || status.toLowerCase().includes('running');

          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface-2)', padding: 12, borderRadius: 8, border: '1px solid var(--hairline)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {svc}
                    {c.Sandbox && (
                      <span title={c.HostPath || 'Agent sandbox (reused across terminal sessions)'} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent-ink)', background: 'var(--accent-soft)', borderRadius: 5, padding: '1px 6px' }}>
                        sandbox
                      </span>
                    )}
                  </span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      color: isRunning ? 'var(--ps-green)' : 'var(--ink-soft)'
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: isRunning ? 'var(--ps-green)' : 'var(--ink-faint)' }} />
                      {status}
                    </span>
                    {ports && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)' }}>ports: {ports}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => handleLogs(svc)}
                    style={{ all: 'unset', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--hairline)', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}
                  >
                    Logs
                  </button>
                  <button
                    onClick={() => handleRestart(svc)}
                    disabled={restarting[svc]}
                    style={{ all: 'unset', cursor: restarting[svc] ? 'not-allowed' : 'pointer', padding: '4px 8px', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--hairline)', fontSize: 11, fontFamily: 'var(--font-mono)', color: restarting[svc] ? 'var(--ink-faint)' : 'var(--ink)' }}
                  >
                    {restarting[svc] ? 'Restarting...' : 'Restart'}
                  </button>
                  {c.Sandbox && (
                    <button
                      onClick={() => handleRemove(svc)}
                      disabled={removing[svc]}
                      title="Remove this sandbox (recreated on next use)"
                      style={{ all: 'unset', cursor: removing[svc] ? 'not-allowed' : 'pointer', padding: '4px 8px', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--hairline)', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ps-red)' }}
                    >
                      {removing[svc] ? 'Removing...' : 'Remove'}
                    </button>
                  )}
                </div>
              </div>
              {logs[svc] && (
                <div style={{ background: '#0e1117', border: '1px solid #21262d', borderRadius: 6, padding: 8, overflow: 'auto', maxHeight: 200, fontFamily: 'var(--font-mono)', fontSize: 10, color: '#c9d1d9', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {logs[svc]}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <WindowTitle
        icon={<Icon.Tools size={14} />}
        label={win.title || 'Containers'}
      />
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {renderContent()}
      </div>
    </>
  );
}

// In standard agent-added files, make sure the default export matches if needed, though vite glob imports handle named exports just fine for Windows.
export default ContainersWindow;

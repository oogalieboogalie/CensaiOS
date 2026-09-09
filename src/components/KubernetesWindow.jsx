import React, { useState, useEffect } from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { useVisibilityAwareInterval } from '../lib/usePolling.js';

export function KubernetesWindow({ win, onUpdate }) {
  const [data, setData] = useState({ namespaces: [], pods: [], deployments: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/kubernetes/status');
      if (!res.ok) {
        if (res.status === 503) {
          const err = await res.json();
          throw new Error(err.message || 'Not configured');
        }
        throw new Error(`Failed to fetch kubernetes status: ${res.statusText}`);
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useVisibilityAwareInterval(fetchStatus, 10000);

  const renderContent = () => {
    if (loading && (!data.namespaces || !data.namespaces.length)) {
      return <div style={{ padding: 14, color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>Loading cluster state...</div>;
    }
    if (error) {
      return (
        <div style={{ padding: 14, color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          {error.includes('Not configured') || error.includes('No current cluster') || error.includes('No valid kubeconfig') ? (
            <div>
              <p style={{ color: 'var(--ink-soft)', marginBottom: 8 }}>Kubernetes is not configured.</p>
              <p style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Please ensure a valid kubeconfig exists on the server where Censai is running.</p>
            </div>
          ) : (
            <p style={{ color: 'var(--ps-red)' }}>Error: {error}</p>
          )}
        </div>
      );
    }

    return (
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 24, overflow: 'auto' }}>

        {/* Namespaces Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--ink)', borderBottom: '1px solid var(--hairline)', paddingBottom: 4 }}>
            Namespaces ({data.namespaces ? data.namespaces.length : 0})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {(data.namespaces || []).map((ns, i) => (
              <div key={i} style={{ padding: 8, background: 'var(--surface-2)', borderRadius: 6, border: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink)', fontWeight: 600 }}>{ns.name}</span>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: ns.status === 'Active' ? 'var(--ps-green)' : 'var(--ink-faint)' }}>{ns.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Deployments Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--ink)', borderBottom: '1px solid var(--hairline)', paddingBottom: 4 }}>
            Deployments ({data.deployments ? data.deployments.length : 0})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(data.deployments || []).map((dep, i) => (
              <div key={i} style={{ padding: 8, background: 'var(--surface-2)', borderRadius: 6, border: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink)', fontWeight: 600 }}>{dep.name}</span>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}>{dep.namespace}</span>
                </div>
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: dep.readyReplicas === dep.replicas ? 'var(--ps-green)' : 'var(--ps-amber)' }}>
                  {dep.readyReplicas}/{dep.replicas} ready
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pods Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--ink)', borderBottom: '1px solid var(--hairline)', paddingBottom: 4 }}>
            Pods ({data.pods ? data.pods.length : 0})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(data.pods || []).map((pod, i) => {
              const isRunning = pod.status === 'Running' || pod.status === 'Succeeded';
              const isPending = pod.status === 'Pending';
              const color = isRunning ? 'var(--ps-green)' : (isPending ? 'var(--ps-amber)' : 'var(--ps-red)');
              return (
                <div key={i} style={{ padding: 8, background: 'var(--surface-2)', borderRadius: 6, border: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink)', fontWeight: 600 }}>{pod.name}</span>
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}>{pod.namespace}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {pod.restarts > 0 && <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ps-amber)' }}>Restarts: {pod.restarts}</span>}
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color }}>{pod.status}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <WindowTitle
        icon={<Icon.Tools size={14} />}
        label={win.title || 'Kubernetes'}
      />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {renderContent()}
      </div>
    </>
  );
}

export default KubernetesWindow;

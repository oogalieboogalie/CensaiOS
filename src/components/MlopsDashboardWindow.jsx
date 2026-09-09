import { useState, useEffect } from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { useWorkspaceStore } from '../lib/store.js';

const workspaceStillActive = workspaceId => useWorkspaceStore.getState().workspaceId === workspaceId;

export function MlopsDashboardWindow({ win, onUpdate }) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchModels();
  }, [workspaceId]);

  const fetchModels = async () => {
    setModels([]);
    setSelectedModel(null);
    setAlerts([]);
    if (!workspaceId) return setLoading(false);
    const requestedScope = workspaceId;
    setLoading(true);
    try {
      const res = await fetch(`/api/mlops/models?workspaceId=${encodeURIComponent(requestedScope)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'MLOps models unavailable');
      if (workspaceStillActive(requestedScope)) setModels(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch models:', err);
    } finally {
      if (workspaceStillActive(requestedScope)) setLoading(false);
    }
  };

  const selectModel = async (model) => {
    setSelectedModel(model);
    const requestedScope = workspaceId;
    try {
      const res = await fetch(`/api/mlops/models/${model.id}/alerts?workspaceId=${encodeURIComponent(requestedScope)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'MLOps alerts unavailable');
      if (workspaceStillActive(requestedScope)) setAlerts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
      if (workspaceStillActive(requestedScope)) setAlerts([]);
    }
  };

  return (
    <>
      <WindowTitle
        icon={<Icon.Tools size={14} />}
        label={win.title || 'MLOps Observability'}
        subtitle="Real-time Drift Detection"
      />

      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        background: 'var(--window-bg, var(--surface))',
      }}>
        {/* Model List Sidebar */}
        <div style={{
          width: 240,
          borderRight: '1px solid var(--hairline)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface-1)',
        }}>
          <div style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase' }}>
            Deployed Models
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {models.map(m => (
              <div
                key={m.id}
                onClick={() => selectModel(m)}
                style={{
                  padding: '10px 16px',
                  cursor: 'pointer',
                  background: selectedModel?.id === m.id ? 'var(--accent-faint)' : 'transparent',
                  borderLeft: selectedModel?.id === m.id ? '3px solid var(--accent)' : '3px solid transparent',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{m.data.modelName}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>v{m.data.version} • Drift: {(m.data.lastDriftScore || 0).toFixed(3)}</div>
              </div>
            ))}
            {models.length === 0 && !loading && (
              <div style={{ padding: 20, fontSize: 12, color: 'var(--ink-faint)', textAlign: 'center' }}>
                No models registered
              </div>
            )}
          </div>
        </div>

        {/* Detail View */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: 20 }}>
          {selectedModel ? (
            <>
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{selectedModel.data.modelName} <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--ink-soft)' }}>v{selectedModel.data.version}</span></h2>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>Deployment ID: {selectedModel.id}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                <div style={{ padding: 16, background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--hairline)' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: 4 }}>Drift Score</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: (selectedModel.data.lastDriftScore > selectedModel.data.thresholds.driftScore) ? 'var(--red)' : 'var(--green)' }}>
                    {(selectedModel.data.lastDriftScore || 0).toFixed(4)}
                  </div>
                </div>
                <div style={{ padding: 16, background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--hairline)' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: 4 }}>Threshold</div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{selectedModel.data.thresholds.driftScore}</div>
                </div>
                <div style={{ padding: 16, background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--hairline)' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: 4 }}>Last Seen</div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{selectedModel.data.lastSeenAt ? new Date(selectedModel.data.lastSeenAt).toLocaleString() : 'N/A'}</div>
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Drift Alerts</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {alerts.map(a => (
                    <div key={a.id} style={{ padding: 12, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)' }}>Drift Detected: {a.data.maxDrift.toFixed(4)}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{new Date(a.created_at).toLocaleString()}</div>
                      </div>
                      <button style={{ padding: '4px 12px', borderRadius: 6, background: 'var(--red)', color: 'white', fontSize: 11, border: 'none', cursor: 'pointer' }}>
                        Investigate
                      </button>
                    </div>
                  ))}
                  {alerts.length === 0 && (
                    <div style={{ padding: 20, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--hairline)', textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)' }}>
                      No active alerts
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-faint)', flexDirection: 'column' }}>
              <Icon.Tools size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
              <div>Select a model to view drift analytics</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

import { useState, useEffect } from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { useWorkspaceStore } from '../lib/store.js';
import { AddModelForm } from './mlops/AddModelForm.jsx';

const workspaceStillActive = workspaceId => useWorkspaceStore.getState().workspaceId === workspaceId;

export function MlopsDashboardWindow({ win, onUpdate }) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openAlertId, setOpenAlertId] = useState(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchModels();
  }, [workspaceId]);

  const fetchModels = async (openId = null) => {
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
      const list = Array.isArray(data) ? data : [];
      if (workspaceStillActive(requestedScope)) setModels(list);
      const added = openId && list.find((m) => m.id === openId);
      if (added && workspaceStillActive(requestedScope)) selectModel(added);
    } catch (err) {
      console.error('Failed to fetch models:', err);
    } finally {
      if (workspaceStillActive(requestedScope)) setLoading(false);
    }
  };

  const selectModel = async (model) => {
    setAdding(false);
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
          <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase' }}>Deployed Models</span>
            <button
              onClick={() => setAdding(true)}
              disabled={!workspaceId}
              style={{ padding: '3px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--hairline)', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}
            >
              Add a model
            </button>
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
                <div style={{ fontSize: 'var(--text-md)', fontWeight: 500, color: 'var(--ink)' }}>{m.data.modelName}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>v{m.data.version} • Drift: {(m.data.lastDriftScore || 0).toFixed(3)}</div>
              </div>
            ))}
            {models.length === 0 && !loading && (
              <div style={{ padding: 20, fontSize: 'var(--text-sm)', color: 'var(--ink-faint)', textAlign: 'center' }}>
                No models yet. Press Add a model to start watching one.
              </div>
            )}
          </div>
        </div>

        {/* Detail View */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: 20 }}>
          {adding ? (
            <AddModelForm
              workspaceId={workspaceId}
              onCancel={() => setAdding(false)}
              onAdded={(model) => { setAdding(false); fetchModels(model?.id); }}
            />
          ) : selectedModel ? (
            <>
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 600 }}>{selectedModel.data.modelName} <span style={{ fontSize: 'var(--text-base)', fontWeight: 400, color: 'var(--ink-soft)' }}>v{selectedModel.data.version}</span></h2>
                {(selectedModel.data.provider || selectedModel.data.purpose) && (
                  <div style={{ fontSize: 'var(--text-base)', color: 'var(--ink)', marginTop: 6 }}>
                    {[selectedModel.data.provider, selectedModel.data.purpose].filter(Boolean).join(' · ')}
                  </div>
                )}
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', marginTop: 4 }}>Deployment ID: {selectedModel.id}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                <div style={{ padding: 16, background: 'var(--surface-2)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--hairline)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: 4 }}>Drift Score</div>
                  <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: (selectedModel.data.lastDriftScore > selectedModel.data.thresholds.driftScore) ? 'var(--red)' : 'var(--green)' }}>
                    {(selectedModel.data.lastDriftScore || 0).toFixed(4)}
                  </div>
                </div>
                <div style={{ padding: 16, background: 'var(--surface-2)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--hairline)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: 4 }}>Threshold</div>
                  <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>{selectedModel.data.thresholds?.driftScore}</div>
                </div>
                <div style={{ padding: 16, background: 'var(--surface-2)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--hairline)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', textTransform: 'uppercase', marginBottom: 4 }}>Last Seen</div>
                  <div style={{ fontSize: 'var(--text-base)', fontWeight: 500 }}>{selectedModel.data.lastSeenAt ? new Date(selectedModel.data.lastSeenAt).toLocaleString() : 'N/A'}</div>
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 12 }}>Drift Alerts</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {alerts.map(a => (
                    <div key={a.id} style={{ padding: 12, background: 'color-mix(in oklab, var(--danger) 10%, transparent)', border: '1px solid color-mix(in oklab, var(--danger) 20%, transparent)', borderRadius: 'var(--radius-lg)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--red)' }}>Drift Detected: {a.data.maxDrift.toFixed(4)}</div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>{new Date(a.created_at).toLocaleString()}</div>
                        </div>
                        <button
                          onClick={() => setOpenAlertId(openAlertId === a.id ? null : a.id)}
                          aria-expanded={openAlertId === a.id}
                          style={{ padding: '4px 12px', borderRadius: 'var(--radius-md)', background: 'var(--red)', color: 'var(--on-fill)', fontSize: 'var(--text-xs)', border: 'none', cursor: 'pointer' }}
                        >
                          {openAlertId === a.id ? 'Hide' : 'Investigate'}
                        </button>
                      </div>
                      {openAlertId === a.id && <DriftBreakdown results={a.data.driftResults} threshold={selectedModel.data.thresholds?.driftScore} />}
                    </div>
                  ))}
                  {alerts.length === 0 && (
                    <div style={{ padding: 20, background: 'var(--surface-2)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--hairline)', textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
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

// Which inputs drifted, worst first: the alert's own per-input scores.
function DriftBreakdown({ results, threshold }) {
  const rows = Object.entries(results || {}).sort(([, x], [, y]) => (y?.score || 0) - (x?.score || 0));
  if (rows.length === 0) {
    return <div style={{ marginTop: 10, fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>This alert has no per-input details saved.</div>;
  }
  return (
    <table style={{ marginTop: 10, width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
      <thead>
        <tr style={{ color: 'var(--ink-faint)', textAlign: 'left' }}>
          <th style={{ padding: '4px 6px' }}>Input</th><th style={{ padding: '4px 6px' }}>Drift</th>
          <th style={{ padding: '4px 6px' }}>Seen</th><th style={{ padding: '4px 6px' }}>Usual</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, r]) => (
          <tr key={name} style={{ borderTop: '1px solid var(--hairline)', color: threshold != null && r?.score > threshold ? 'var(--red)' : 'var(--ink)' }}>
            <td style={{ padding: '4px 6px', fontFamily: 'var(--font-mono)' }}>{name.replace(/_/g, ' ')}</td>
            <td style={{ padding: '4px 6px' }}>{Number(r?.score || 0).toFixed(3)}</td>
            <td style={{ padding: '4px 6px' }}>{typeof r?.value === 'number' ? r.value.toFixed(3) : String(r?.value ?? '')}</td>
            <td style={{ padding: '4px 6px' }}>{typeof r?.baselineMean === 'number' ? r.baselineMean.toFixed(3) : 'n/a'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

import { useState, useEffect } from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { useWorkspaceStore } from '../lib/store.js';
import { AddModelForm } from './mlops/AddModelForm.jsx';
import { logFailure } from '../lib/appLog/browserLog.js';
import './mlops/mlops.css';

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
      logFailure('mlops: could not load models', err, 'mlops', 'error');
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
      logFailure('mlops: could not load alerts', err, 'mlops', 'error');
      if (workspaceStillActive(requestedScope)) setAlerts([]);
    }
  };

  const overThreshold = (m) => (m.data.lastDriftScore || 0) > (m.data.thresholds?.driftScore ?? Infinity);

  return (
    <>
      <WindowTitle
        icon={<Icon.Tools size={14} />}
        label={win.title || 'MLOps Observability'}
        subtitle="Real-time Drift Detection"
      />

      <div className="ml-root">
        <aside className="ml-side">
          <div className="ml-side-head">
            <span className="ml-label">Deployed models</span>
            <button type="button" className="ml-btn" onClick={() => setAdding(true)} disabled={!workspaceId}>
              Add a model
            </button>
          </div>
          <div className="ml-list">
            {models.map(m => (
              <button
                type="button"
                key={m.id}
                className="ml-model"
                aria-current={selectedModel?.id === m.id ? 'true' : undefined}
                onClick={() => selectModel(m)}
              >
                <span className="ml-model-name">
                  <span className="ml-dot" data-tone={overThreshold(m) ? 'danger' : 'ok'} />
                  {m.data.modelName}
                </span>
                <span className="ml-model-sub">v{m.data.version} · Drift {(m.data.lastDriftScore || 0).toFixed(3)}</span>
              </button>
            ))}
            {models.length === 0 && !loading && (
              <p className="ml-side-empty">No models yet. Press Add a model to start watching one.</p>
            )}
          </div>
        </aside>

        <section className="ml-main">
          {adding ? (
            <AddModelForm
              workspaceId={workspaceId}
              onCancel={() => setAdding(false)}
              onAdded={(model) => { setAdding(false); fetchModels(model?.id); }}
            />
          ) : selectedModel ? (
            <>
              <header className="ml-head">
                <h2 className="ml-title">{selectedModel.data.modelName} <span className="ml-version">v{selectedModel.data.version}</span></h2>
                {(selectedModel.data.provider || selectedModel.data.purpose) && (
                  <div className="ml-purpose">
                    {[selectedModel.data.provider, selectedModel.data.purpose].filter(Boolean).join(' · ')}
                  </div>
                )}
                <div className="ml-id">Deployment ID: {selectedModel.id}</div>
              </header>

              <div className="ml-stats">
                <div className="hb-stat">
                  <span className="hb-stat-label">Drift score</span>
                  <span className="hb-stat-value" data-tone={overThreshold(selectedModel) ? 'danger' : 'ok'}>
                    {(selectedModel.data.lastDriftScore || 0).toFixed(4)}
                  </span>
                </div>
                <div className="hb-stat">
                  <span className="hb-stat-label">Threshold</span>
                  <span className="hb-stat-value">{selectedModel.data.thresholds?.driftScore}</span>
                </div>
                <div className="hb-stat">
                  <span className="hb-stat-label">Last seen</span>
                  <span className="hb-stat-value ml-stat-small">{selectedModel.data.lastSeenAt ? new Date(selectedModel.data.lastSeenAt).toLocaleString() : 'N/A'}</span>
                </div>
              </div>

              <h3 className="ml-section">Drift alerts</h3>
              <div className="ml-alerts">
                {alerts.map(a => (
                  <div key={a.id} className="ml-alert">
                    <div className="ml-alert-row">
                      <div>
                        <div className="ml-alert-title">Drift Detected: {a.data.maxDrift.toFixed(4)}</div>
                        <div className="ml-alert-when">{new Date(a.created_at).toLocaleString()}</div>
                      </div>
                      <button
                        type="button"
                        className="ml-btn ml-btn--danger"
                        onClick={() => setOpenAlertId(openAlertId === a.id ? null : a.id)}
                        aria-expanded={openAlertId === a.id}
                      >
                        {openAlertId === a.id ? 'Hide' : 'Investigate'}
                      </button>
                    </div>
                    {openAlertId === a.id && <DriftBreakdown results={a.data.driftResults} threshold={selectedModel.data.thresholds?.driftScore} />}
                  </div>
                ))}
                {alerts.length === 0 && <div className="ml-quiet hb-well">No active alerts</div>}
              </div>
            </>
          ) : (
            <div className="hb-empty">
              <div className="hb-empty-icon"><Icon.Tools size={22} /></div>
              <div className="hb-empty-title">{models.length ? 'Pick a model to see its drift' : 'Watch a model for drift'}</div>
              <p className="hb-empty-text">
                {models.length
                  ? 'Choose a model on the left to see its drift score, its threshold and any alerts.'
                  : 'Add a model you run, send it the inputs it sees, and this window warns you when they drift from what it was trained on.'}
              </p>
              {!models.length && (
                <div className="hb-empty-actions">
                  <button type="button" className="ml-btn ml-btn--primary" onClick={() => setAdding(true)} disabled={!workspaceId}>
                    Add your first model
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

// Which inputs drifted, worst first: the alert's own per-input scores.
function DriftBreakdown({ results, threshold }) {
  const rows = Object.entries(results || {}).sort(([, x], [, y]) => (y?.score || 0) - (x?.score || 0));
  if (rows.length === 0) {
    return <div className="ml-alert-when ml-breakdown-empty">This alert has no per-input details saved.</div>;
  }
  return (
    <table className="ml-table">
      <thead>
        <tr><th>Input</th><th>Drift</th><th>Seen</th><th>Usual</th></tr>
      </thead>
      <tbody>
        {rows.map(([name, r]) => (
          <tr key={name} data-over={threshold != null && r?.score > threshold ? 'true' : undefined}>
            <td className="ml-mono">{name.replace(/_/g, ' ')}</td>
            <td>{Number(r?.score || 0).toFixed(3)}</td>
            <td>{typeof r?.value === 'number' ? r.value.toFixed(3) : String(r?.value ?? '')}</td>
            <td>{typeof r?.baselineMean === 'number' ? r.baselineMean.toFixed(3) : 'n/a'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

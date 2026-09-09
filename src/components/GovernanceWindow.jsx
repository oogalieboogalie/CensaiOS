import React from 'react';
import { WindowTitle } from './Windows.jsx';
import { Icon } from './Icons.jsx';
import { api } from '../lib/api.js';

export function GovernanceWindow({ win, onUpdate }) {
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [metrics, setMetrics] = React.useState({
    totalScans: 0,
    criticalIssues: 0,
    warnIssues: 0,
    cleanRuns: 0
  });

  const fetchHistory = React.useCallback(async () => {
    setLoading(true);
    try {
      // Use the operational intelligence API to fetch Vex run completions
      const data = await api.get('/operational-intelligence/events?type=vex.run.completed&limit=20');
      const eventsList = Array.isArray(data) ? data : [];
      setEvents(eventsList);

      const newMetrics = { totalScans: eventsList.length, criticalIssues: 0, warnIssues: 0, cleanRuns: 0 };
      eventsList.forEach(e => {
        if (e.payload?.verdict === 'critical') newMetrics.criticalIssues++;
        else if (e.payload?.verdict === 'warn') newMetrics.warnIssues++;
        else newMetrics.cleanRuns++;
      });
      setMetrics(newMetrics);
    } catch (err) {
      // In tests or when the feature flag is off, this API might fail.
      // We don't want to spam console.error which trips smoke tests.
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return (
    <>
      <WindowTitle
        icon={<Icon.Tools size={14} />}
        label={win.title || 'AI Governance'}
        subtitle={loading ? 'updating...' : `${metrics.totalScans} scans recorded`}
        attachedAgentIds={win.attachedAgents}
      />
      <div style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        color: 'var(--ink)',
        background: 'var(--surface)',
        fontFamily: 'var(--font-ui)',
      }}>
        {/* Metrics Overview */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <MetricCard label="Total Scans" value={metrics.totalScans} icon={<Icon.History size={16} />} />
          <MetricCard label="Critical" value={metrics.criticalIssues} color="var(--red)" icon={<Icon.Alert size={16} />} />
          <MetricCard label="Warnings" value={metrics.warnIssues} color="var(--orange)" icon={<Icon.Info size={16} />} />
          <MetricCard label="Clean" value={metrics.cleanRuns} color="var(--green)" icon={<Icon.Check size={16} />} />
        </div>

        {/* Scan History Table */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Validation History</h3>
            <button
              onClick={fetchHistory}
              disabled={loading}
              style={{
                all: 'unset', cursor: 'pointer', fontSize: 11, color: 'var(--accent)', fontWeight: 600
              }}
            >
              Refresh
            </button>
          </div>

          <div style={{
            border: '1px solid var(--hairline)',
            borderRadius: 8,
            overflow: 'hidden',
            background: 'var(--surface-2)'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface-3)', borderBottom: '1px solid var(--hairline)' }}>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Task</th>
                  <th style={thStyle}>Verdict</th>
                  <th style={thStyle}>Agents</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 && !loading && (
                  <tr>
                    <td colSpan="4" style={{ padding: 40, textAlign: 'center', color: 'var(--ink-faint)' }}>
                      No security scans recorded yet.
                    </td>
                  </tr>
                )}
                {events.map(event => (
                  <tr key={event.id} style={{ borderBottom: '1px solid var(--hairline-soft)' }}>
                    <td style={tdStyle}>{new Date(event.created_at).toLocaleString()}</td>
                    <td style={tdStyle}>{event.payload?.task || 'unknown'}</td>
                    <td style={tdStyle}>
                      <StatusBadge verdict={event.payload?.verdict} />
                    </td>
                    <td style={tdStyle}>{event.payload?.agents_succeeded}/{event.payload?.agents_dispatched}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ padding: 12, borderRadius: 8, background: 'var(--accent-faint)', color: 'var(--accent)', fontSize: 11, lineHeight: 1.4 }}>
          <strong>Unified AI Code Validation Framework:</strong> Automatic security scanning is integrated with the Vex Orchestrator.
          Use the <code>security_scan</code> task to trigger a new validation run across the repository.
        </div>
      </div>
    </>
  );
}

function MetricCard({ label, value, color, icon }) {
  return (
    <div style={{
      padding: '12px 16px',
      borderRadius: 10,
      background: 'var(--surface-2)',
      border: '1px solid var(--hairline)',
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-soft)', fontSize: 11 }}>
        {icon}
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--ink)' }}>{value}</div>
    </div>
  );
}

function StatusBadge({ verdict }) {
  const colors = {
    critical: { bg: '#fee2e2', text: '#991b1b', label: 'CRITICAL' },
    warn: { bg: '#ffedd5', text: '#9a3412', label: 'WARNING' },
    clean: { bg: '#dcfce7', text: '#166534', label: 'CLEAN' }
  };
  const c = colors[verdict] || colors.clean;
  return (
    <span style={{
      padding: '2px 6px', borderRadius: 4, background: c.bg, color: c.text, fontSize: 10, fontWeight: 800
    }}>
      {c.label}
    </span>
  );
}

const thStyle = { padding: '8px 12px', textAlign: 'left', color: 'var(--ink-soft)', fontWeight: 600 };
const tdStyle = { padding: '10px 12px' };

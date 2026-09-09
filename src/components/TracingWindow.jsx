import React from 'react';
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { fmtTime } from './operations/OperationsShared.jsx';
import { useWorkspaceStore } from '../lib/store.js';
import { convertTraceToTest, getTraceEvents, getTraces } from '../lib/api/tracing.js';
const emptyStyle = { flex: 1, height: '100%', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', color: 'var(--ink-faint)' };
const cardStyle = { padding: 8, background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 6 };
const workspaceStillActive = workspaceId => useWorkspaceStore.getState().workspaceId === workspaceId;
export function TracingWindow({ win, onUpdate }) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const hasWorkspace = Boolean(String(workspaceId || '').trim());
  const [traces, setTraces] = React.useState([]);
  const [selectedTraceId, setSelectedTraceId] = React.useState(null);
  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const loadTraces = React.useCallback(async () => {
    if (!hasWorkspace) return;
    setLoading(true);
    setNotice('');
    try {
      const data = await getTraces(workspaceId);
      if (!workspaceStillActive(workspaceId)) return;
      setTraces(Array.isArray(data) ? data : []);
    } catch (err) {
      if (workspaceStillActive(workspaceId)) setNotice(err.message);
    } finally {
      if (workspaceStillActive(workspaceId)) setLoading(false);
    }
  }, [hasWorkspace, workspaceId]);
  const loadEvents = React.useCallback(async (id) => {
    setLoading(true);
    setNotice('');
    try {
      const data = await getTraceEvents(workspaceId, id);
      if (!workspaceStillActive(workspaceId)) return;
      setEvents(Array.isArray(data) ? data : []);
      setSelectedTraceId(id);
    } catch (err) {
      if (workspaceStillActive(workspaceId)) setNotice(err.message);
    } finally {
      if (workspaceStillActive(workspaceId)) setLoading(false);
    }
  }, [workspaceId]);
  const convertToTest = async (id) => {
    setNotice('');
    try {
      await convertTraceToTest(workspaceId, id);
      if (workspaceStillActive(workspaceId)) setNotice('Regression test created.');
    } catch (err) {
      if (workspaceStillActive(workspaceId)) setNotice(err.message);
    }
  };
  React.useEffect(() => {
    setTraces([]);
    setEvents([]);
    setSelectedTraceId(null);
    setNotice('');
    if (hasWorkspace) loadTraces();
  }, [hasWorkspace, loadTraces, workspaceId]);
  const selectedTrace = traces.find(t => t.id === selectedTraceId);
  return (
    <>
      <WindowTitle
        icon={<Icon.Search size={14} />}
        label={win.title || 'Agentic Tracing'}
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })}
      >
        <button type="button" aria-label="Refresh traces" onClick={loadTraces} disabled={loading || !hasWorkspace} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
          <Icon.Refresh size={12} />
        </button>
      </WindowTitle>
      {!hasWorkspace ? (
        <div data-testid="tracing-workspace-required" style={emptyStyle}>
          Open a workspace to inspect its agent traces.
        </div>
      ) : <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '250px 1fr', overflow: 'hidden', background: 'var(--surface)', color: 'var(--ink)' }}>
        <div style={{ borderRight: '1px solid var(--hairline)', overflowY: 'auto', padding: 8 }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', opacity: 0.7 }}>Recent Traces</h4>
          {notice && <div role="status" style={{ ...cardStyle, marginBottom: 8, color: 'var(--ink-soft)', fontSize: 11 }}>{notice}</div>}
          {!notice && !loading && traces.length === 0 && <div style={{ color: 'var(--ink-faint)', fontSize: 11 }}>No traces in this workspace.</div>}
          {traces.map(t => (
            <button
              type="button"
              key={t.id}
              onClick={() => loadEvents(t.id)}
              style={{
                width: '100%', padding: 8, textAlign: 'left', color: 'var(--ink)',
                cursor: 'pointer',
                borderRadius: 6,
                marginBottom: 4,
                fontSize: '11px',
                background: selectedTraceId === t.id ? 'var(--accent-soft)' : 'transparent',
                border: '1px solid var(--hairline)',
              }}
            >
              <div style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
              <div style={{ opacity: 0.6 }}>{fmtTime(new Date(t.created_at))}</div>
              <div style={{ marginTop: 4, color: t.data?.status === 'failed' ? 'var(--ps-red)' : 'var(--ps-green)' }}>{t.data?.status || 'unknown'}</div>
            </button>
          ))}
        </div>
        <div style={{ overflowY: 'auto', padding: 12 }}>
          {selectedTrace ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--hairline)', paddingBottom: 8 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '14px' }}>{selectedTrace.title}</h3>
                  <div style={{ fontSize: '11px', opacity: 0.7 }}>ID: {selectedTrace.id}</div>
                </div>
                <button type="button" onClick={() => convertToTest(selectedTrace.id)}
                  style={{
                    background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none',
                    padding: '4px 8px', borderRadius: 4, fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  Convert to Regression Test
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 16 }}>
                <div style={cardStyle}>
                  <div style={{ fontSize: '9px', opacity: 0.6, textTransform: 'uppercase' }}>Agent</div>
                  <div style={{ fontSize: '12px' }}>{selectedTrace.data?.agentId}</div>
                </div>
                <div style={cardStyle}>
                  <div style={{ fontSize: '9px', opacity: 0.6, textTransform: 'uppercase' }}>Window</div>
                  <div style={{ fontSize: '12px' }}>{selectedTrace.data?.windowId || 'N/A'}</div>
                </div>
                {selectedTrace.data?.timings && (
                  <div style={cardStyle}>
                    <div style={{ fontSize: '9px', opacity: 0.6, textTransform: 'uppercase' }}>Total Duration</div>
                    <div style={{ fontSize: '12px' }}>{selectedTrace.data.timings.total_ms}ms</div>
                  </div>
                )}
              </div>
              <h4 style={{ fontSize: '12px', borderBottom: '1px solid var(--hairline)', paddingBottom: 4 }}>Execution Timeline</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {events.map(e => (
                  <div key={e.id} style={{ padding: 8, borderLeft: '2px solid var(--accent)', background: 'var(--surface-2)', borderRadius: '0 4px 4px 0', fontSize: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{e.event_type}</span>
                      <span style={{ fontSize: '10px', opacity: 0.6 }}>{fmtTime(new Date(e.created_at))}</span>
                    </div>
                    {e.event_type === 'agent.round' && (
                      <div>
                        <div>Round: {e.payload.round}</div>
                        <div style={{ fontSize: '11px', opacity: 0.8 }}>
                          Model: {e.payload.modelConfig?.model} | Messages: {e.payload.messagesCount} | Tools: {e.payload.toolsAvailableCount}
                        </div>
                      </div>
                    )}
                    {e.event_type === 'tool.invocation' && (
                      <div>
                        <div style={{ fontWeight: '500' }}>
                          {e.payload.toolName}{e.payload.private ? ' (private)' : ''}
                        </div>
                        <div style={{
                          marginTop: 4, padding: 4, background: 'var(--surface)', borderRadius: 2,
                          fontSize: '11px',
                          maxHeight: '100px',
                          overflowY: 'auto',
                          fontFamily: 'var(--font-mono)'
                        }}>
                          {e.payload.private
                            ? 'Arguments and result redacted'
                            : `${e.payload.resultType || 'unknown'} result · ${e.payload.resultLength ?? 0} units`}
                          {!e.payload.private && e.payload.summary && ` · ${JSON.stringify(e.payload.summary)}`}
                        </div>
                        <div style={{ fontSize: '10px', marginTop: 4, color: e.payload.ok ? 'var(--ps-green)' : 'var(--ps-red)' }}>
                          {e.payload.ok ? '✓ Success' : '✗ Failed'} ({e.payload.ms}ms)
                        </div>
                      </div>
                    )}
                    {e.event_type === 'session.failure' && (
                      <div style={{ color: 'var(--ps-red)' }}>
                        <div style={{ fontWeight: 'bold' }}>{e.payload.failure || 'Execution failed'}</div>
                        {e.payload.toolName && <div>Tool: {e.payload.toolName}</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={emptyStyle}>{loading ? 'Loading traces…' : 'Select a trace to view details.'}</div>
          )}
        </div>
      </div>}
    </>
  );
}

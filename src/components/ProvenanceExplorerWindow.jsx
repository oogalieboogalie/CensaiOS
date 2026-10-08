import React from 'react';
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { useWorkspaceStore } from '../lib/store.js';
import { getProvenance, getProvenanceRecord } from '../lib/api/tracing.js';

const emptyStyle = { flex: 1, height: '100%', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', color: 'var(--ink-faint)', fontSize: 'var(--text-sm)', lineHeight: 1.5 };
const sectionLabel = { fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', letterSpacing: 'var(--label-tracking)', textTransform: 'var(--label-case)', color: 'var(--ink-faint)', marginBottom: 6 };
const boxStyle = { background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: 10, fontSize: 'var(--text-xs)', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflow: 'auto' };
const workspaceStillActive = workspaceId => useWorkspaceStore.getState().workspaceId === workspaceId;

function featureOffMessage(err) {
  return err?.status === 404 && err?.payload?.feature === 'operational-intelligence'
    ? 'Provenance is off on this server. Set CENSAI_FEATURE_OPERATIONAL_INTELLIGENCE=true and restart.'
    : null;
}

/**
 * Provenance Explorer: traces code an agent wrote back to the agent, model
 * and prompt that produced it. Records are written by the file-writing tools
 * (local, GitHub, project) when an agent runs them from chat.
 */
export function ProvenanceExplorerWindow({ win = {}, onUpdate }) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const hasWorkspace = Boolean(String(workspaceId || '').trim());
  const [records, setRecords] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [filter, setFilter] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [notice, setNotice] = React.useState('');

  const load = React.useCallback(async () => {
    if (!hasWorkspace) return;
    setLoading(true);
    setNotice('');
    try {
      const data = await getProvenance(workspaceId);
      if (!workspaceStillActive(workspaceId)) return;
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      if (workspaceStillActive(workspaceId)) setNotice(featureOffMessage(err) || err.message);
    } finally {
      if (workspaceStillActive(workspaceId)) setLoading(false);
    }
  }, [hasWorkspace, workspaceId]);

  const open = React.useCallback(async (id) => {
    setNotice('');
    try {
      const record = await getProvenanceRecord(workspaceId, id);
      if (workspaceStillActive(workspaceId)) setSelected(record);
    } catch (err) {
      if (workspaceStillActive(workspaceId)) setNotice(err.message);
    }
  }, [workspaceId]);

  React.useEffect(() => {
    setRecords([]);
    setSelected(null);
    if (hasWorkspace) load();
  }, [hasWorkspace, load, workspaceId]);

  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? records.filter(r => `${r.data?.file_path} ${r.owner_id} ${r.data?.model}`.toLowerCase().includes(needle))
    : records;

  return (
    <>
      <WindowTitle
        icon={<Icon.Search size={14} />}
        label={win.title || 'Provenance Explorer'}
        subtitle={hasWorkspace ? `${records.length} record${records.length === 1 ? '' : 's'}` : 'no workspace'}
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })}
      >
        <button type="button" aria-label="Refresh provenance" onClick={load} disabled={loading || !hasWorkspace} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
          <Icon.Refresh size={12} />
        </button>
      </WindowTitle>
      {!hasWorkspace ? (
        <div style={emptyStyle}>Open a workspace to see which agent wrote which code.</div>
      ) : (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '260px 1fr', minHeight: 0, background: 'var(--surface)', color: 'var(--ink)' }}>
          <div style={{ borderRight: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: 8, borderBottom: '1px solid var(--hairline)' }}>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by file, agent or model"
                style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--hairline)', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 'var(--text-xs)' }}
              />
            </div>
            {notice && <div role="status" style={{ padding: 10, fontSize: 'var(--text-xs)', color: 'var(--ps-red)', lineHeight: 1.4 }}>{notice}</div>}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {!loading && !notice && visible.length === 0 && (
                <div style={{ padding: 14, fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', lineHeight: 1.5 }}>
                  {records.length === 0
                    ? 'No AI-written code yet. Records appear here when an agent writes a file from chat.'
                    : 'Nothing matches that filter.'}
                </div>
              )}
              {visible.map(record => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => open(record.id)}
                  style={{ all: 'unset', display: 'block', boxSizing: 'border-box', width: '100%', cursor: 'pointer', padding: '9px 12px', borderBottom: '1px solid var(--hairline)', background: selected?.id === record.id ? 'var(--accent-soft)' : 'transparent' }}
                >
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.data?.file_path || record.title}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', marginTop: 3 }}>
                    {record.owner_id} · {record.data?.model || 'unknown model'} · {new Date(record.created_at).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div style={{ overflowY: 'auto', padding: 14, minWidth: 0 }}>
            {selected ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <section>
                  <div style={sectionLabel}>Written by</div>
                  <div style={{ fontSize: 'var(--text-sm)' }}>
                    <b>{selected.owner_id}</b> using <b>{selected.data?.model || 'unknown model'}</b> into <code>{selected.data?.file_path}</code>
                    {selected.metadata?.repo ? <> in <code>{selected.metadata.repo}</code></> : null}
                    {selected.metadata?.project ? <> in project <code>{selected.metadata.project}</code></> : null}
                    {selected.metadata?.branch ? <> on <code>{selected.metadata.branch}</code></> : null}
                  </div>
                </section>
                <section>
                  <div style={sectionLabel}>Prompt</div>
                  <div style={{ ...boxStyle, maxHeight: 180 }}>
                    {selected.metadata?.prompt_visible
                      ? (selected.metadata.full_prompt || selected.data?.prompt_preview || '(empty)')
                      : `Hidden: this came from another member's chat (${selected.metadata?.prompt_length || 0} characters).`}
                  </div>
                </section>
                <section>
                  <div style={sectionLabel}>Generated code</div>
                  <pre style={{ ...boxStyle, margin: 0, fontFamily: 'var(--font-mono)', maxHeight: 320 }}>{selected.data?.code_snippet}</pre>
                </section>
                <section>
                  <div style={sectionLabel}>Lineage</div>
                  {(selected.events || []).length === 0
                    ? <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>No events linked to this record.</div>
                    : (selected.events || []).map(event => (
                      <div key={event.id} style={{ fontSize: 'var(--text-xs)', padding: '4px 0', borderBottom: '1px solid var(--hairline)' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}>{new Date(event.created_at).toLocaleTimeString()}</span>{' '}
                        <b>{event.event_type}</b> by {event.actor_id}
                      </div>
                    ))}
                </section>
              </div>
            ) : (
              <div style={emptyStyle}>Pick a record to see the prompt, the code and its lineage.</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

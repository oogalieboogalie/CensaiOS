import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { useWorkspaceStore } from '../lib/store.js';
import { useVisibilityAwareInterval } from '../lib/usePolling.js';
import { ScoutPanel } from './leads/ScoutPanel.jsx';

const STATUS_DOT = { new: 'var(--ps-green)', contacted: 'var(--accent)', qualified: 'var(--ps-teal)', dead: 'var(--ink-faint)' };

export function LeadsWindow() {
  const workspaceId = useWorkspaceStore((s) => s.workspaceId);
  const [leads, setLeads] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState('all');
  const [error, setError] = React.useState('');
  const [scoutOpen, setScoutOpen] = React.useState(false);
  const [drafts, setDrafts] = React.useState({});
  const [copiedId, setCopiedId] = React.useState(null);

  const load = React.useCallback(async () => {
    if (!workspaceId) {
      setLeads([]);
      setLoading(false);
      return;
    }
    try {
      const params = new URLSearchParams({ workspaceId });
      if (filter !== 'all') params.set('status', filter);
      const res = await fetch(`/api/sales-leads?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to load leads');
      setLeads(Array.isArray(data.leads) ? data.leads : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, filter]);

  React.useEffect(() => { load(); }, [load]);
  useVisibilityAwareInterval(load, workspaceId ? 15000 : null);

  const refresh = React.useCallback(() => {
    setLoading(true);
    load();
  }, [load]);

  const draftEmail = React.useCallback(async (lead) => {
    if (!workspaceId || drafts[lead.id]?.loading) return;
    setDrafts((current) => ({ ...current, [lead.id]: { loading: true } }));
    try {
      const res = await fetch(`/api/scout/draft?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Draft failed');
      setDrafts((current) => ({ ...current, [lead.id]: { loading: false, subject: data.subject, body: data.body } }));
    } catch (err) {
      setDrafts((current) => ({ ...current, [lead.id]: { loading: false, error: err.message || 'Draft failed' } }));
    }
  }, [workspaceId, drafts]);

  const copyDraft = React.useCallback(async (lead) => {
    const draft = drafts[lead.id];
    if (!draft?.body) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.subject || ''}\n\n${draft.body}`);
      setCopiedId(lead.id);
      setTimeout(() => setCopiedId((current) => current === lead.id ? null : current), 2000);
    } catch {
      setError('Copy failed — select the text manually.');
    }
  }, [drafts]);

  const setStatus = React.useCallback(async (lead, next) => {
    if (!next || next === lead.status) return;
    try {
      const res = await fetch(`/api/sales-leads/${encodeURIComponent(lead.id)}/status?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error('Status update failed');
      setLeads((current) => current.map((l) => l.id === lead.id ? { ...l, status: next } : l));
    } catch (err) {
      setError(err.message || 'Status update failed');
    }
  }, [workspaceId]);

  const counts = React.useMemo(() => {
    const map = { all: leads.length, new: 0, contacted: 0, qualified: 0, dead: 0 };
    for (const lead of leads) {
      if (map[lead.status] !== undefined) map[lead.status] += 1;
    }
    return map;
  }, [leads]);

  return (
    <>
      <WindowTitle
        accent="var(--ps-green)"
        icon={<Icon.Group size={14} />}
        label="Lead Queue"
        subtitle={`${counts.new} new · ${leads.length} total`}
      >
        <button
          onClick={refresh}
          title="Refresh queue"
          style={{ all: 'unset', cursor: 'pointer', fontSize: 13, color: 'var(--ink-faint)', padding: '0 2px' }}
        >
          ↻
        </button>
        <button
          onClick={() => setScoutOpen((o) => !o)}
          title="Run a scout pass"
          style={{ all: 'unset', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: scoutOpen ? 'white' : 'var(--accent-ink)', background: scoutOpen ? 'var(--accent)' : 'var(--accent-soft)', borderRadius: 7, padding: '3px 10px' }}
        >
          ⌖ Scout
        </button>
      </WindowTitle>
      {scoutOpen && <ScoutPanel workspaceId={workspaceId} onScouted={load} />}
      <div style={{ display: 'flex', gap: 4, padding: '8px 10px 0', flexWrap: 'wrap' }}>
        {['all', 'new', 'contacted', 'qualified', 'dead'].map((s) => (
          <button
            key={s}
            onClick={() => { setFilter(s); setLoading(true); }}
            style={{
              all: 'unset', cursor: 'pointer', fontSize: 11, padding: '3px 10px', borderRadius: 999,
              background: filter === s ? 'var(--accent-soft)' : 'var(--surface-2)',
              color: filter === s ? 'var(--accent-ink)' : 'var(--ink-soft)', fontWeight: filter === s ? 700 : 400,
            }}
          >
            {s} ({s === 'all' ? leads.length : counts[s] || 0})
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && <div style={{ color: 'var(--ink-faint)', fontSize: 12, padding: 8 }}>Loading leads…</div>}
        {!loading && error && <div style={{ color: 'var(--ps-red)', fontSize: 12, padding: 8 }}>{error}</div>}
        {!loading && !error && leads.length === 0 && (
          <div style={{ color: 'var(--ink-faint)', fontSize: 12, padding: 8, fontStyle: 'italic' }}>
            No leads here yet — run a scout and they land in this queue.
            {workspaceId && (
              <span style={{ display: 'block', marginTop: 4, fontStyle: 'normal', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                workspace {String(workspaceId).slice(0, 8)}
              </span>
            )}
          </div>
        )}
        {leads.map((lead) => {
          const socials = [
            lead.facebook && ['fb', lead.facebook],
            lead.instagram && ['ig', lead.instagram],
            lead.linkedin && ['li', lead.linkedin],
          ].filter(Boolean);
          return (
            <div key={lead.id} style={{ border: '1px solid var(--hairline)', borderRadius: 10, padding: '8px 10px', background: 'var(--surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: STATUS_DOT[lead.status] || 'var(--ink-faint)' }} />
                <strong style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lead.name}
                </strong>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent-ink)', background: 'var(--accent-soft)', borderRadius: 6, padding: '1px 7px' }}>
                  {(Number(lead.icp_score) || 0).toFixed(2)}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 3 }}>
                {[lead.team, lead.brokerage, lead.city].filter(Boolean).join(' · ') || '—'}
              </div>
              <div style={{ fontSize: 11, marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {lead.phone && <a href={`tel:${lead.phone}`} style={{ color: 'var(--accent-ink)', textDecoration: 'none' }}>{lead.phone}</a>}
                {lead.email && <a href={`mailto:${lead.email}`} style={{ color: 'var(--accent-ink)', textDecoration: 'none' }}>{lead.email}</a>}
                {lead.website && <a href={lead.website} target="_blank" rel="noreferrer" style={{ color: 'var(--ink-faint)', textDecoration: 'none' }}>site ↗</a>}
                {socials.map(([label, url]) => (
                  <a key={label} href={url} target="_blank" rel="noreferrer" title={url} style={{ color: 'var(--ink-faint)', textDecoration: 'none' }}>{label} ↗</a>
                ))}
              </div>
              {Array.isArray(lead.buying_signals) && lead.buying_signals.length > 0 && (
                <div style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>
                  ⚡ {lead.buying_signals.join(' · ')}
                </div>
              )}
              <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {['new', 'contacted', 'qualified', 'dead'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(lead, s)}
                    title={s === lead.status ? 'Current status' : `Mark as ${s}`}
                    style={{
                      all: 'unset', cursor: s === lead.status ? 'default' : 'pointer',
                      fontSize: 10, fontWeight: s === lead.status ? 700 : 400,
                      color: s === lead.status ? 'var(--accent-ink)' : 'var(--ink-faint)',
                      background: s === lead.status ? 'var(--accent-soft)' : 'transparent',
                      border: '1px solid var(--hairline)', borderRadius: 999, padding: '2px 9px',
                    }}
                  >
                    {s}
                  </button>
                ))}
                <button
                  onClick={() => draftEmail(lead)}
                  disabled={drafts[lead.id]?.loading}
                  title="Draft an outreach email for this lead"
                  style={{ all: 'unset', cursor: drafts[lead.id]?.loading ? 'not-allowed' : 'pointer', fontSize: 10, fontWeight: 700, color: 'var(--ps-teal)', border: '1px solid var(--hairline)', borderRadius: 999, padding: '2px 9px', marginLeft: 'auto' }}
                >
                  {drafts[lead.id]?.loading ? '✎…' : drafts[lead.id]?.body ? '↻ Redraft' : '✎ Draft'}
                </button>
              </div>
              {drafts[lead.id]?.error && (
                <div style={{ fontSize: 11, color: 'var(--ps-red)', marginTop: 6 }}>{drafts[lead.id].error}</div>
              )}
              {drafts[lead.id]?.body && (
                <div style={{ marginTop: 6, border: '1px dashed var(--hairline)', borderRadius: 8, padding: '7px 9px', background: 'var(--surface-2)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{drafts[lead.id].subject}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', whiteSpace: 'pre-wrap', marginTop: 4 }}>{drafts[lead.id].body}</div>
                  <button
                    onClick={() => copyDraft(lead)}
                    style={{ all: 'unset', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--accent-ink)', marginTop: 6 }}
                  >
                    {copiedId === lead.id ? '✓ Copied' : '⧉ Copy'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

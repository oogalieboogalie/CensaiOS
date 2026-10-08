/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { CANONICAL_DISPOSITIONS, suggestRecommendation } from '../../scripts/ideas/recommend-lib.mjs';

const STATUSES = ['placed', 'parked', 'absorbed', 'killed', 'needs-contract'];

async function readJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

function sortCards(rows, key, dir) {
  const mul = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? '')) * mul);
}

// Canvas-native Idea Foundry (librarian slice 3): browses the deterministic
// idea index, filters/sorts the cards, and routes dispositions back through
// POST /api/ideas/disposition (frontmatter `status:` write + index refresh).
export function IdeaFoundryWindow({ win }) {
  const [cards, setCards] = React.useState(null);
  const [error, setError] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [phaseFilter, setPhaseFilter] = React.useState('all');
  const [tagFilter, setTagFilter] = React.useState('');
  const [sortKey, setSortKey] = React.useState('file');
  const [sortDir, setSortDir] = React.useState('asc');
  const [expanded, setExpanded] = React.useState(null);
  const [saving, setSaving] = React.useState(null);

  const load = React.useCallback(async () => {
    setError('');
    try {
      const data = await readJson('/api/ideas');
      setCards(Array.isArray(data.cards) ? data.cards : []);
    } catch (err) {
      setError(err.message || 'Failed to load ideas');
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const enriched = React.useMemo(() => {
    if (!cards) return null;
    return cards.map((card) => ({ card, rec: suggestRecommendation(card, cards) }));
  }, [cards]);

  const phases = React.useMemo(
    () => [...new Set((cards || []).map((c) => c.phase).filter(Boolean))].sort(),
    [cards],
  );

  const visible = React.useMemo(() => {
    if (!enriched) return null;
    const tag = tagFilter.trim().toLowerCase();
    const filtered = enriched.filter(({ card, rec }) => {
      if (statusFilter !== 'all' && card.status !== statusFilter) return false;
      if (phaseFilter !== 'all' && card.phase !== phaseFilter) return false;
      if (tag && !(card.tags || []).some((t) => String(t).toLowerCase().includes(tag))) return false;
      return true;
    });
    return sortCards(filtered.map(({ card, rec }) => ({
      file: card.path, phase: rec.suggestedPhase, status: card.status,
      companions: rec.companions.length, card, rec,
    })), sortKey, sortDir);
  }, [enriched, statusFilter, phaseFilter, tagFilter, sortKey, sortDir]);

  const flipSort = (key) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const setDisposition = async (file, disposition) => {
    setSaving(file);
    try {
      await readJson('/api/ideas/disposition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, disposition }),
      });
      await load();
    } catch (err) {
      setError(err.message || 'Failed to update disposition');
    } finally {
      setSaving(null);
    }
  };

  const th = (label, key) => (
    <button type="button" onClick={() => flipSort(key)} title={`Sort by ${label}`} style={{ all: 'unset', cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {label}{sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </button>
  );

  return (
    <>
      <WindowTitle icon={<Icon.Flask size={14} />} label={win?.title || 'Idea Foundry'} subtitle={cards ? `${cards.length} idea cards` : 'loading'} />
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-sans)' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ fontSize: 'var(--text-sm)', padding: '6px 8px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--hairline)', background: 'var(--surface-2)', color: 'var(--ink)' }}>
            <option value="all">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select aria-label="Filter by phase" value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)} style={{ fontSize: 'var(--text-sm)', padding: '6px 8px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--hairline)', background: 'var(--surface-2)', color: 'var(--ink)' }}>
            <option value="all">All phases</option>
            {phases.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input aria-label="Filter by tag" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} placeholder="Filter by tag…" style={{ fontSize: 'var(--text-sm)', padding: '6px 10px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--hairline)', background: 'var(--surface-2)', color: 'var(--ink)', minWidth: 140 }} />
        </div>

        {error && <div role="alert" style={{ fontSize: 'var(--text-sm)', color: 'var(--ps-red)', marginBottom: 8 }}>{error}</div>}
        {visible === null && !error && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)', fontStyle: 'italic' }}>Loading idea index…</div>}
        {visible !== null && visible.length === 0 && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)', fontStyle: 'italic' }}>No idea cards match these filters.</div>}

        {visible !== null && visible.length > 0 && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 130px 90px', gap: 8, padding: '4px 10px' }}>
              {th('File', 'file')}{th('Phase', 'phase')}{th('Status', 'status')}{th('Links', 'companions')}
            </div>
            {visible.map(({ file, phase, status, companions, card, rec }) => {
              const open = expanded === file;
              return (
                <div key={file} style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', marginBottom: 6, background: 'var(--surface-raised)', overflow: 'hidden' }}>
                  <button type="button" onClick={() => setExpanded(open ? null : file)} aria-expanded={open} style={{ all: 'unset', cursor: 'pointer', display: 'grid', gridTemplateColumns: '1fr 90px 130px 90px', gap: 8, padding: '9px 10px', width: '100%', boxSizing: 'border-box', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.title || file}</span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>{phase}</span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>{status}</span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>{companions}</span>
                  </button>
                  {open && (
                    <div style={{ padding: '4px 12px 12px', borderTop: '1px dashed var(--hairline)', fontSize: 'var(--text-sm)' }}>
                      <p style={{ color: 'var(--ink-soft)', lineHeight: 1.5, margin: '8px 0' }}>{rec.rationale}</p>
                      {rec.companions.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Companions</div>
                          {rec.companions.map((c) => <div key={c.path} style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>{c.title || c.path}</div>)}
                        </div>
                      )}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)' }}>
                        Disposition
                        <select aria-label={`Disposition for ${file}`} value={card.status} disabled={saving === file} onChange={(e) => setDisposition(file, e.target.value)} style={{ fontSize: 'var(--text-sm)', padding: '6px 8px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--hairline)', background: 'var(--surface-2)', color: 'var(--ink)' }}>
                          {CANONICAL_DISPOSITIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                        {saving === file && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', fontStyle: 'italic' }}>Saving…</span>}
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

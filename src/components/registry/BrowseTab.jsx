// src/components/registry/BrowseTab.jsx
// D4 RegistryWindow tab 1 — paginated REST list of cards with Install button.

import React from 'react';

const inputStyle = {
  flex: 1, padding: '7px 10px', borderRadius: 7,
  border: '1px solid var(--hairline)', background: 'var(--surface)',
  color: 'var(--ink)', fontSize: 12,
};

function CardRow({ card, installed, onInstall, canInstall, busy }) {
  const isInstalled = Boolean(installed[card.id]);
  const isDisabled = isInstalled || !canInstall || busy;
  return (
    <div data-testid="registry-browse-row" data-card-id={card.id} style={{ border: '1px solid var(--hairline)', borderRadius: 8, background: 'var(--surface-2)', padding: 10, display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong style={{ fontSize: 13, color: 'var(--ink)' }}>{card.name}</strong>
        {card.version && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)' }}>v{card.version}</span>}
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-faint)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{card.visibility}</span>
      </div>
      {card.description && <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', lineHeight: 1.4 }}>{card.description}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-faint)' }}>
        {(card.skills || []).slice(0, 4).map((s) => (
          <span key={s.id || s.name} style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--surface)' }}>{s.name || s.id}</span>
        ))}
      </div>
      <div>
        <button
          type="button"
          data-testid="registry-install"
          disabled={isDisabled}
          title={!canInstall ? 'Open a workspace to install AgentCards.' : undefined}
          onClick={() => onInstall(card.id)}
          style={{
            all: 'unset',
            cursor: isDisabled ? 'default' : 'pointer',
            padding: '5px 10px', borderRadius: 6,
            border: '1px solid var(--hairline)',
            background: isDisabled ? 'var(--surface)' : 'var(--accent-soft)',
            color: isDisabled ? 'var(--ink-faint)' : 'var(--accent-ink)',
            fontSize: 11.5, fontWeight: 600,
          }}
        >
          {isInstalled ? 'Installed' : busy ? 'Installing…' : 'Install'}
        </button>
      </div>
    </div>
  );
}

export function BrowseTab({ client, installed, onInstall, canInstall = true, busyIds = new Set() }) {
  const [cards, setCards] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [filter, setFilter] = React.useState('');
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await client.listCards({ visibility: 'public', limit: 50 });
      setCards(result?.items || []);
    } catch (err) {
      setError(err.message || 'Failed to load cards');
    } finally {
      setLoading(false);
    }
  }, [client]);

  React.useEffect(() => { load(); }, [load]);

  const filtered = cards.filter((c) => {
    if (!filter.trim()) return true;
    const needle = filter.toLowerCase();
    return (
      c.name?.toLowerCase().includes(needle)
      || c.description?.toLowerCase().includes(needle)
      || (c.skills || []).some((s) => (s.name || s.id || '').toLowerCase().includes(needle))
    );
  });

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0, overflow: 'auto' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name, description, skill…"
          data-testid="registry-browse-filter"
          style={inputStyle}
        />
        <button type="button" onClick={load} disabled={loading} data-testid="registry-browse-refresh" style={{ all: 'unset', cursor: 'pointer', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--hairline)', background: 'var(--surface-2)', fontSize: 12, color: 'var(--ink)' }}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {error && <div data-testid="registry-error" style={{ color: 'var(--ps-red)', fontSize: 12 }}>{error}</div>}
      {!loading && filtered.length === 0 && (
        <div data-testid="registry-browse-empty" style={{ border: '1px dashed var(--hairline)', borderRadius: 8, padding: 18, color: 'var(--ink-faint)', fontSize: 12, textAlign: 'center' }}>
          No cards match.
        </div>
      )}
      <div data-testid="registry-browse-list" style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
        {filtered.map((card) => (
          <CardRow
            key={card.id}
            card={card}
            installed={installed}
            canInstall={canInstall}
            busy={busyIds.has(card.id)}
            onInstall={onInstall}
          />
        ))}
      </div>
    </div>
  );
}

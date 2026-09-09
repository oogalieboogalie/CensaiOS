import React from 'react';
import { Icon } from './Icons.jsx';

export function YouTubeSearch({ label = 'Search YouTube', onPick }) {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const search = async () => {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}&maxResults=5`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `YouTube search failed (${res.status})`);
      setResults(data.items || []);
    } catch (err) {
      setResults([]);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-faint)' }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 6 }}>
        <input
          type="text"
          placeholder="Search videos..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') search(); }}
          style={{ minWidth: 0, background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '10px 12px', font: '13px var(--font-sans)', color: 'var(--ink)', outline: 'none' }}
        />
        <button
          onClick={search}
          disabled={!query.trim() || loading}
          title="Search YouTube"
          style={{ all: 'unset', cursor: query.trim() && !loading ? 'pointer' : 'not-allowed', width: 38, borderRadius: 8, background: 'var(--accent)', color: 'white', display: 'grid', placeItems: 'center', opacity: query.trim() && !loading ? 1 : 0.5 }}
        >
          <Icon.Search size={14} />
        </button>
      </div>
      {error && (
        <div style={{ padding: '8px 10px', borderRadius: 8, background: 'oklch(0.96 0.03 25)', color: 'oklch(0.42 0.16 25)', fontSize: 12 }}>
          {error}
        </div>
      )}
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {results.map(item => (
            <button
              key={item.id}
              onClick={() => onPick?.(item)}
              style={{ all: 'unset', cursor: 'pointer', display: 'grid', gridTemplateColumns: item.thumbnail ? '64px minmax(0, 1fr)' : 'minmax(0, 1fr)', gap: 8, alignItems: 'center', padding: 8, background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 8 }}
            >
              {item.thumbnail && <img src={item.thumbnail} alt="" style={{ width: 64, height: 36, objectFit: 'cover', borderRadius: 5, background: 'var(--surface)' }} />}
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                <div style={{ fontSize: 10, color: 'var(--ink-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.channelTitle}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

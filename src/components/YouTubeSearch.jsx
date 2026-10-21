import React from 'react';
import { Icon } from './Icons.jsx';
import { logToApp } from '../lib/appLog/browserLog.js';
import { saveYouTubeKey, youtubeKeyStatus, youtubeNeedsKey } from '../lib/youtube/keyStatus.js';
import { YouTubeKeyPrompt } from './youtube/YouTubeKeyPrompt.jsx';

const WHO = { music: 'Music Player', stream: 'Stream Viewer', shorts: 'Shorts' };

export function YouTubeSearch({ label = 'Search YouTube', onPick, from = '' }) {
  const where = WHO[from] ? from : 'youtube';
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [needsKey, setNeedsKey] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    youtubeKeyStatus().then((status) => {
      if (alive && status.configured === false) setNeedsKey(true);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  React.useEffect(() => {
    if (needsKey) logToApp('info', 'youtube search needs a key', { where });
  }, [needsKey, where]);

  const search = async () => {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ q, maxResults: '5' });
      if (WHO[from]) params.set('from', from);
      const res = await fetch(`/api/youtube/search?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (youtubeNeedsKey(data.error, data.code)) {
          setNeedsKey(true);
          setResults([]);
          return;
        }
        throw new Error(data.error || `YouTube search failed (${res.status})`);
      }
      setResults(data.items || []);
      logToApp('info', 'youtube search worked', { where });
    } catch (err) {
      setResults([]);
      setError(err.message);
      logToApp('warn', 'youtube search failed', { where });
    } finally {
      setLoading(false);
    }
  };

  const save = async (apiKey) => {
    await saveYouTubeKey(apiKey);
    logToApp('info', 'youtube key saved', { where });
    setNeedsKey(false);
    setError('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-label)', textTransform: 'var(--label-case)', letterSpacing: 'var(--label-tracking)', color: 'var(--ink-faint)' }}>{label}</div>
      {needsKey ? (
        <YouTubeKeyPrompt who={WHO[from] || 'YouTube'} onSave={save} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 6 }}>
          <input
            type="text"
            placeholder="Search videos..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') search(); }}
            style={{ minWidth: 0, background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', padding: '10px 12px', font: '13px var(--font-sans)', color: 'var(--ink)', outline: 'none' }}
          />
          <button
            onClick={search}
            disabled={!query.trim() || loading}
            title="Search YouTube"
            style={{ all: 'unset', cursor: query.trim() && !loading ? 'pointer' : 'not-allowed', width: 38, borderRadius: 'var(--radius-lg)', background: 'var(--accent)', color: 'var(--accent-contrast)', display: 'grid', placeItems: 'center', opacity: query.trim() && !loading ? 1 : 0.5 }}
          >
            <Icon.Search size={14} />
          </button>
        </div>
      )}
      {error && (
        <div style={{ padding: '8px 10px', borderRadius: 'var(--radius-lg)', background: 'oklch(0.96 0.03 25)', color: 'oklch(0.42 0.16 25)', fontSize: 'var(--text-sm)' }}>
          {error}
        </div>
      )}
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {results.map(item => (
            <button
              key={item.id}
              onClick={() => onPick?.(item)}
              style={{ all: 'unset', cursor: 'pointer', display: 'grid', gridTemplateColumns: item.thumbnail ? '64px minmax(0, 1fr)' : 'minmax(0, 1fr)', gap: 8, alignItems: 'center', padding: 8, background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)' }}
            >
              {item.thumbnail && <img src={item.thumbnail} alt="" style={{ width: 64, height: 36, objectFit: 'cover', borderRadius: 'var(--radius-sm)', background: 'var(--surface)' }} />}
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.channelTitle}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

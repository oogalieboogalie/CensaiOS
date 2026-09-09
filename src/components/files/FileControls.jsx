import React from 'react';

export function FileModeSelector({ mode, onUpdate }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--hairline)', background: 'var(--surface)' }}>
      <button 
        onClick={() => onUpdate({ mode: 'local' })} 
        style={{ flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 600, color: mode === 'local' ? 'var(--ink)' : 'var(--ink-faint)', background: mode === 'local' ? 'var(--surface-2)' : 'transparent', border: 'none', borderRight: '1px solid var(--hairline)', cursor: 'pointer' }}
      >
        Local
      </button>
      <button 
        onClick={() => onUpdate({ mode: 'github' })} 
        style={{ flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 600, color: mode === 'github' ? 'var(--ink)' : 'var(--ink-faint)', background: mode === 'github' ? 'var(--surface-2)' : 'transparent', border: 'none', cursor: 'pointer' }}
      >
        GitHub
      </button>
    </div>
  );
}

export function LocalPathBar({ pathInput, setPathInput, loadDir, clearDir }) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: '4px 6px 8px', borderBottom: '1px solid var(--hairline)', marginBottom: 8 }}>
      <input
        type="text"
        value={pathInput}
        onChange={e => setPathInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') loadDir(); }}
        style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 6, padding: '4px 8px', font: '10px var(--font-mono)', color: 'var(--ink)', outline: 'none' }}
      />
      <button onClick={loadDir} style={{ all: 'unset', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontSize: 10, fontWeight: 600 }}>Reload</button>
      <button onClick={clearDir} style={{ all: 'unset', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: 'transparent', color: 'var(--ink-faint)', fontSize: 10 }}>Reset</button>
    </div>
  );
}

export function GithubRepoBar({ githubRepo, clearDir }) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: '4px 6px 8px', borderBottom: '1px solid var(--hairline)', marginBottom: 8, alignItems: 'center' }}>
      <div style={{ flex: 1, font: '10px var(--font-mono)', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{githubRepo}</div>
      <button onClick={clearDir} style={{ all: 'unset', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: 'transparent', color: 'var(--ink-faint)', fontSize: 10 }}>Reset</button>
    </div>
  );
}

export function FileSearchFilter({ searchInput, setSearchInput }) {
  return (
    <div style={{ padding: '0 6px 8px', borderBottom: '1px solid var(--hairline)', marginBottom: 8 }}>
      <input
        type="text"
        placeholder="Filter paths..."
        value={searchInput}
        onChange={e => setSearchInput(e.target.value)}
        style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 6, padding: '4px 8px', font: '10px var(--font-mono)', color: 'var(--ink)', outline: 'none' }}
      />
    </div>
  );
}

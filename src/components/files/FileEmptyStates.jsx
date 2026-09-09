import React from 'react';

export function LocalEmptyState({ pathInput, setPathInput, loadDir }) {
  return (
    <div style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ color: 'var(--ink-soft)', fontSize: 12, fontFamily: 'var(--font-sans)', lineHeight: 1.4 }}>
        Paste an absolute folder path on your computer to browse files recursively. Drag files to the canvas to open code in the editor or documents with annotations.
      </div>
      <input
        type="text"
        placeholder="e.g. C:\path\to\your\project"
        value={pathInput}
        onChange={e => setPathInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') loadDir(); }}
        style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '8px 10px', font: '11px var(--font-mono)', color: 'var(--ink)', outline: 'none' }}
      />
      <button
        onClick={loadDir}
        style={{ all: 'unset', cursor: 'pointer', padding: '8px 12px', borderRadius: 8, background: 'var(--accent)', color: 'white', fontSize: 12, fontWeight: 600, textAlign: 'center' }}
      >
        Load Folder
      </button>
    </div>
  );
}

export function GithubRepoList({ repos, onSelect }) {
  return (
    <div style={{ padding: '4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ color: 'var(--ink-soft)', fontSize: 11, fontFamily: 'var(--font-sans)', paddingBottom: 8, paddingLeft: 4 }}>
        Select a repository to browse:
      </div>
      {repos.map(r => (
        <div
          key={r.name}
          onClick={() => onSelect(r.name)}
          style={{ padding: '6px 8px', cursor: 'pointer', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 2 }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.name}</div>
          {r.description && <div style={{ fontSize: 10, color: 'var(--ink-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.description}</div>}
        </div>
      ))}
    </div>
  );
}

import React from 'react';
import { createDirectory, createFile } from '../../lib/api/files.js';

/**
 * Inline VS Code-style creator row for the Files window.
 * mode: 'folder' | 'file'. Creates inside `dirPath`, then reports back
 * so the parent can refresh and (for files) open the result.
 */
export function FileCreateRow({ mode, dirPath, onDone, onOpenFile }) {
  const [name, setName] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef(null);

  React.useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setStatus('');
    try {
      if (mode === 'folder') {
        await createDirectory(dirPath, trimmed);
      } else {
        const sep = dirPath.endsWith('/') || dirPath.endsWith('\\') ? '' : '/';
        const fullPath = `${dirPath}${sep}${trimmed}`;
        await createFile(fullPath, '');
        onOpenFile?.(trimmed, fullPath);
      }
      onDone?.(true);
    } catch (err) {
      setStatus(err?.message || 'Create failed');
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 6, padding: '6px 10px', alignItems: 'center' }}>
      <span style={{ color: 'var(--ink-faint)', fontSize: 12 }}>{mode === 'folder' ? '📁' : '📄'}</span>
      <input
        ref={inputRef}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onDone?.(false);
        }}
        placeholder={mode === 'folder' ? 'New folder name…' : 'New file name…'}
        style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 6, padding: '4px 8px', font: '11px var(--font-mono)', color: 'var(--ink)', outline: 'none' }}
      />
      {status && <span style={{ color: 'var(--ps-red)', fontSize: 10 }}>{status}</span>}
      <button onClick={() => onDone?.(false)} style={{ all: 'unset', cursor: 'pointer', color: 'var(--ink-faint)', fontSize: 11 }}>✕</button>
    </div>
  );
}

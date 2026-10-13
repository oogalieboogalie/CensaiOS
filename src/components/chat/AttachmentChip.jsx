import React from 'react';
import { Icon } from '../Icons.jsx';

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function AttachmentChip({ attachment: a, onRemove }) {
  const icon = a.kind === 'image' ? <Icon.Picture size={13}/>
    : a.kind === 'audio' ? <Icon.Mic size={13}/>
    : a.kind === 'video' ? <Icon.Video size={13}/>
    : <Icon.Files size={13}/>;
  return (
    <div data-testid="chat-attachment-chip" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 8px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', maxWidth: 220, fontSize: 'var(--text-xs)' }}>
      {a.kind === 'image' && a.dataUrl
        ? <img src={a.dataUrl} alt="" style={{ width: 22, height: 22, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
        : <span style={{ color: 'var(--ink-soft)', display: 'grid' }}>{icon}</span>}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
      {a.size ? <span style={{ color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{formatBytes(a.size)}</span> : null}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${a.name}`} style={{ all: 'unset', cursor: 'pointer', color: 'var(--ink-faint)', padding: '0 2px' }}>×</button>
      )}
    </div>
  );
}

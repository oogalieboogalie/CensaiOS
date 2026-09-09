import React from 'react';
import { renderMarkdown } from '../../lib/renderMarkdown.jsx';
import { Icon } from '../Icons.jsx';
import { diffStats } from './toolActivity.js';
import { ChangeImpactBreadcrumbs } from './ChangeImpactBreadcrumbs.jsx';

export function ChatBubble({ message: m, index, copied, onCopy }) {
  const canCopy = !m.hidden && String(m.text || '').length > 0;
  const isMe = m.from === 'me';

  // Handler for copying inline code snippets
  const handleCopyCode = React.useCallback((codeText) => {
    navigator.clipboard.writeText(codeText).catch(err => console.error('Failed to copy:', err));
  }, []);

  if (m.hidden) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{
          maxWidth: '92%', padding: '5px 9px', borderRadius: 999,
          background: 'var(--surface)', color: 'var(--ink-faint)',
          border: '1px solid var(--hairline)', fontSize: 10.5, lineHeight: 1.45,
          fontFamily: 'var(--font-mono)', userSelect: 'text', WebkitUserSelect: 'text',
        }}>
          {m.text}
        </div>
      </div>
    );
  }

  // Agent messages flow: full-width plain text, no bubble. User messages
  // sit in a padded neutral box, right-aligned.
  if (!isMe) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-start', minWidth: 0 }}>
        <div style={{
          width: '100%', minWidth: 0,
          background: 'transparent', border: 'none', borderRadius: 0, padding: 0,
          color: 'var(--ink)', fontSize: 13.5, lineHeight: 1.55,
          display: 'flex', flexDirection: 'column', gap: 6,
          position: 'relative', userSelect: 'text', WebkitUserSelect: 'text',
        }}>
          {canCopy && (
            <button
              type="button"
              title={copied ? 'Copied' : 'Copy message'}
              onClick={() => onCopy(m, index)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                position: 'absolute',
                top: 0,
                right: 0,
                width: 22,
                height: 22,
                borderRadius: 6,
                display: 'grid',
                placeItems: 'center',
                color: copied ? 'var(--accent-ink)' : 'var(--ink-faint)',
                background: 'var(--surface-2)',
                border: '1px solid var(--hairline)',
              }}
            >
              {copied ? <Icon.Check size={12} /> : <Icon.Copy size={12} />}
            </button>
          )}
          {m.image && <img src={m.image} alt="attached" style={{ width: '100%', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--hairline)', userSelect: 'none' }} />}
          <div style={{ minWidth: 0, overflowWrap: 'break-word', userSelect: 'text', WebkitUserSelect: 'text' }}>
            {renderMarkdown(m.text, { compact: true, onCopyCode: handleCopyCode })}
          </div>
          {m.activity && <ActivityStrip activity={m.activity} />}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', minWidth: 0 }}>
      <div style={{
        maxWidth: '80%', minWidth: 0,
        padding: '10px 14px',
        paddingRight: canCopy ? 40 : 14,
        borderRadius: 12,
        background: 'var(--surface-2)',
        color: 'var(--ink)',
        border: '1px solid var(--hairline)',
        fontSize: 13.5,
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        position: 'relative',
        userSelect: 'text',
        WebkitUserSelect: 'text',
      }}>
        {canCopy && (
          <button
            type="button"
            title={copied ? 'Copied' : 'Copy message'}
            onClick={() => onCopy(m, index)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              position: 'absolute',
              top: 8,
              right: 9,
              width: 20,
              height: 20,
              borderRadius: 6,
              display: 'grid',
              placeItems: 'center',
              color: copied ? 'var(--accent-ink)' : 'var(--ink-faint)',
              background: copied ? 'var(--accent-soft)' : 'transparent',
            }}
          >
            {copied ? <Icon.Check size={12} /> : <Icon.Copy size={12} />}
          </button>
        )}
        {m.image && <img src={m.image} alt="attached" style={{ width: '100%', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--hairline)', userSelect: 'none' }} />}
        <div style={{ minWidth: 0, userSelect: 'text', WebkitUserSelect: 'text' }}>
          {m.text}
        </div>
      </div>
    </div>
  );
}

function fmtMs(ms) {
  if (!Number.isFinite(ms)) return 'n/a';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

function ActivityStrip({ activity }) {
  const [open, setOpen] = React.useState(false);
  const hasTools = activity.tools?.length > 0;
  return (
    <div style={{ marginTop: 4, borderTop: '1px dashed var(--hairline)', paddingTop: 7 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ all: 'unset', cursor: 'pointer', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)' }}
      >
        <span style={{ color: 'var(--accent-ink)', fontWeight: 700 }}>{hasTools ? 'tool activity' : 'response timing'}</span>
        {activity.projectContext?.length > 0 && <span>{activity.projectContext[0].projectName} context ready</span>}
        <span>total {fmtMs(activity.totalMs)}</span>
        <span>model {fmtMs(activity.modelMs)}</span>
        {hasTools && <span>tools {fmtMs(activity.toolMs)}</span>}
        {activity.rounds > 0 && <span>{activity.rounds} model call{activity.rounds === 1 ? '' : 's'}</span>}
        <span>{open ? 'hide' : 'details'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 7, display: 'grid', gap: 6 }}>
          <ChangeImpactBreadcrumbs impact={activity.changeImpact} />
          {activity.projectContext?.map((context) => (
            <div key={`${context.workspaceId}:${context.projectId}`} style={{ border: '1px solid var(--hairline)', borderRadius: 8, background: 'var(--surface)', padding: '7px 8px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-soft)' }}>
              <span style={{ color: 'var(--accent-ink)', fontWeight: 800 }}>project context</span>
              {` ${context.projectName} · ${context.permission} · ${context.sourceKind}`}
            </div>
          ))}
          {activity.tools?.map((tool, i) => {
            const stats = diffStats(tool.summary);
            const detailText = tool.summary?.path || tool.summary?.target;
            const failed = tool.ok === false;
            return (
              <div key={`${tool.name}-${i}`} style={{ border: `1px solid ${failed ? 'var(--ps-red)' : 'var(--hairline)'}`, borderRadius: 8, background: 'var(--surface)', padding: '7px 8px', display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                  <span style={{ color: failed ? 'var(--ps-red)' : 'var(--accent-ink)', fontWeight: 800 }} data-tool-outcome={failed ? 'failed' : 'ok'}>{failed ? '✗ ' : ''}{tool.name}</span>
                  {failed && <span style={{ color: 'var(--ps-red)', fontWeight: 700 }}>failed</span>}
                  {detailText && <span style={{ color: 'var(--ink-soft)', overflowWrap: 'anywhere' }}>{detailText}</span>}
                  {stats && stats.added > 0 && <span style={{ color: 'var(--accent-ink)', fontWeight: 700 }}>+{stats.added}</span>}
                  {stats && stats.removed > 0 && <span style={{ color: 'var(--ink-faint)', fontWeight: 700 }}>−{stats.removed}</span>}
                  {tool.summary?.files > 1 && <span style={{ color: 'var(--ink-faint)' }}>{tool.summary.files} files</span>}
                  <span style={{ color: 'var(--ink-faint)' }}>{fmtMs(tool.ms)}</span>
                  {Number.isFinite(tool.resultChars) && <span style={{ color: 'var(--ink-faint)' }}>{tool.resultChars.toLocaleString()} chars</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

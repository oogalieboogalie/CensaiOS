import React from 'react';
import { renderMarkdown } from '../../lib/renderMarkdown.jsx';

export function GithubIssuesList({
  issues,
  loadingIssues,
  expandedIssueNumber,
  handleToggleIssue,
  labelInputs,
  setLabelInputs,
  handleAddLabel,
  addingLabel,
}) {
  if (loadingIssues) {
    return <div style={{ color: 'var(--ink-soft)', textAlign: 'center', padding: 24 }}>Loading issues...</div>;
  }

  if (issues.length === 0) {
    return <div style={{ color: 'var(--ink-soft)', textAlign: 'center', padding: 24 }}>No open issues found.</div>;
  }

  return issues.map(issue => {
    const isExpanded = expandedIssueNumber === issue.number;
    return (
      <div
        key={issue.id}
        style={{
          border: '1px solid var(--hairline)',
          borderRadius: 8,
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-card)',
          overflow: 'hidden',
          transition: 'border-color 0.15s',
          flexShrink: 0
        }}
      >
        {/* Issue Header */}
        <div
          onClick={() => handleToggleIssue(issue.number)}
          style={{
            padding: '12px 14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            background: isExpanded ? 'var(--surface-2)' : 'transparent',
            userSelect: 'none'
          }}
          onMouseEnter={e => !isExpanded && (e.currentTarget.style.background = 'var(--surface-2)')}
          onMouseLeave={e => !isExpanded && (e.currentTarget.style.background = 'transparent')}
        >
          <div style={{ color: 'var(--ps-green)', marginTop: 2 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="2" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 650, color: 'var(--ink)', lineHeight: 1.35 }}>
              {issue.title}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-mono)' }}>#{issue.number}</span>
              <span>opened by <strong>{issue.user?.login}</strong></span>
              <span>·</span>
              <span>{new Date(issue.updated_at).toLocaleDateString()}</span>
            </div>

            {/* Inline Labels */}
            {issue.labels && issue.labels.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                {issue.labels.map(lbl => (
                  <span
                    key={lbl.id}
                    style={{
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: `#${lbl.color}22`,
                      color: `#${lbl.color}`,
                      border: `1px solid #${lbl.color}44`,
                      fontWeight: 600
                    }}
                  >
                    {lbl.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <span style={{ color: 'var(--ink-faint)', fontSize: 10 }}>{isExpanded ? '▼' : '▶'}</span>
        </div>

        {/* Issue Expanded Details */}
        {isExpanded && (
          <div style={{
            padding: '14px',
            borderTop: '1px solid var(--hairline)',
            background: 'var(--surface)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            {/* Body description */}
            {issue.body ? (
              <div style={{
                fontSize: 12,
                lineHeight: 1.5,
                color: 'var(--ink-soft)',
                background: 'var(--surface-2)',
                padding: '10px 12px',
                borderRadius: 6,
                border: '1px solid var(--hairline)',
              }}>
                {renderMarkdown(issue.body, { compact: true })}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic' }}>No description provided.</div>
            )}

            {/* Labels manager */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)' }}>Add Label</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Add label name..."
                  value={labelInputs[issue.number] || ''}
                  onChange={(e) => setLabelInputs(prev => ({ ...prev, [issue.number]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddLabel(issue.number, false)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 4,
                    border: '1px solid var(--hairline)',
                    background: 'var(--surface-2)',
                    color: 'var(--ink)',
                    fontSize: 11,
                    outline: 'none'
                  }}
                />
                <button
                  onClick={() => handleAddLabel(issue.number, false)}
                  disabled={addingLabel[issue.number] || !labelInputs[issue.number]?.trim()}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 4,
                    background: 'var(--accent)',
                    color: 'white',
                    border: 'none',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    opacity: labelInputs[issue.number]?.trim() ? 1 : 0.5
                  }}
                >
                  {addingLabel[issue.number] ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  });
}

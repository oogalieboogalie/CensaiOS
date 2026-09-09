import React from 'react';
import { Icon } from '../Icons.jsx';
import { renderMarkdown } from '../../lib/renderMarkdown.jsx';
import { getCiStatus } from './helpers.js';

export function GithubPullsList({
  pulls,
  expandedPrNumber,
  handleTogglePr,
  prDetails,
  loadingDetails,
  labelInputs,
  setLabelInputs,
  handleAddLabel,
  addingLabel,
  showMergeConfirm,
  setShowMergeConfirm,
  mergeOptions,
  setMergeOptions,
  handleMergePr,
  mergingPr,
}) {
  if (pulls.length === 0) {
    return <div style={{ color: 'var(--ink-soft)', textAlign: 'center', padding: 24 }}>No open pull requests found.</div>;
  }

  return pulls.map(pr => {
    const isExpanded = expandedPrNumber === pr.number;
    const ci = getCiStatus(prDetails, pr.number);
    
    return (
      <div
        key={pr.id}
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
        {/* PR Title/Header */}
        <div
          onClick={() => handleTogglePr(pr.number)}
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
              <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
              <path d="M18 15V9a4 4 0 0 0-4-4H9M6 9v6" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 650, color: 'var(--ink)', lineHeight: 1.35 }}>
              {pr.title}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-mono)' }}>#{pr.number}</span>
              <span>opened by <strong>{pr.user?.login}</strong></span>
              <span>·</span>
              <span>{new Date(pr.updated_at).toLocaleDateString()}</span>
            </div>
            
            {/* Inline Labels */}
            {pr.labels && pr.labels.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                {pr.labels.map(lbl => (
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Mini CI status icon */}
            {ci.status === 'success' && <span style={{ color: 'var(--ps-green)' }} title="CI Checks Passed">●</span>}
            {ci.status === 'failure' && <span style={{ color: 'var(--ps-red)' }} title="CI Checks Failed">●</span>}
            {ci.status === 'pending' && <span style={{ color: 'var(--ps-blue)', animation: 'pulse 1.5s infinite' }} title="CI Checks Running">●</span>}
            <span style={{ color: 'var(--ink-faint)', fontSize: 10 }}>{isExpanded ? '▼' : '▶'}</span>
          </div>
        </div>

        {/* PR Expanded Details */}
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
            {pr.body ? (
              <div style={{
                fontSize: 12,
                lineHeight: 1.5,
                color: 'var(--ink-soft)',
                background: 'var(--surface-2)',
                padding: '10px 12px',
                borderRadius: 6,
                border: '1px solid var(--hairline)',
              }}>
                {renderMarkdown(pr.body, { compact: true })}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic' }}>No description provided.</div>
            )}

            {/* Labels manager */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)' }}>Manage Labels</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Add label name..."
                  value={labelInputs[pr.number] || ''}
                  onChange={(e) => setLabelInputs(prev => ({ ...prev, [pr.number]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddLabel(pr.number, true)}
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
                  onClick={() => handleAddLabel(pr.number, true)}
                  disabled={addingLabel[pr.number] || !labelInputs[pr.number]?.trim()}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 4,
                    background: 'var(--accent)',
                    color: 'white',
                    border: 'none',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    opacity: labelInputs[pr.number]?.trim() ? 1 : 0.5
                  }}
                >
                  {addingLabel[pr.number] ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>

            {/* CI Checks detail */}
            <div style={{
              padding: '10px 12px',
              borderRadius: 6,
              background: 'var(--surface-2)',
              border: '1px solid var(--hairline)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)' }}>CI Checks Status</span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: ci.status === 'success' ? 'var(--ps-green)' : ci.status === 'failure' ? 'var(--ps-red)' : 'var(--ps-blue)',
                  color: 'white'
                }}>
                  {ci.text}
                </span>
              </div>

              {loadingDetails ? (
                <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Loading check runs details...</div>
              ) : prDetails[pr.number]?.checkRuns?.check_runs && prDetails[pr.number].checkRuns.check_runs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                  {prDetails[pr.number].checkRuns.check_runs.slice(0, 5).map(run => (
                    <div key={run.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                      <span style={{ color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>{run.name}</span>
                      <span style={{
                        color: run.conclusion === 'success' ? 'var(--ps-green)' : run.conclusion === 'failure' ? 'var(--ps-red)' : 'var(--ink-soft)',
                        fontWeight: 600
                      }}>
                        {run.conclusion || run.status}
                      </span>
                    </div>
                  ))}
                  {prDetails[pr.number].checkRuns.check_runs.length > 5 && (
                    <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontStyle: 'italic', textAlign: 'right' }}>
                      + {prDetails[pr.number].checkRuns.check_runs.length - 5} more checks
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Merge Actions */}
            <div style={{
              marginTop: 6,
              paddingTop: 12,
              borderTop: '1px solid var(--hairline)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}>
              {showMergeConfirm[pr.number] ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: 10,
                  borderRadius: 6,
                  background: 'color-mix(in oklch, var(--ps-green) 8%, transparent)',
                  border: '1px solid color-mix(in oklch, var(--ps-green) 30%, transparent)'
                }}>
                  <div style={{ fontWeight: 700, color: 'var(--ps-green)' }}>Confirm Merge</div>
                  
                  <div style={{ display: 'grid', gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>Commit Title</label>
                    <input
                      type="text"
                      value={mergeOptions[pr.number]?.commit_title || ''}
                      onChange={(e) => setMergeOptions(prev => ({
                        ...prev,
                        [pr.number]: { ...prev[pr.number], commit_title: e.target.value }
                      }))}
                      style={{
                        padding: '5px 8px',
                        borderRadius: 4,
                        border: '1px solid var(--hairline)',
                        background: 'var(--surface)',
                        color: 'var(--ink)',
                        fontSize: 11
                      }}
                    />

                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>Commit Message (Optional)</label>
                    <textarea
                      placeholder="Provide optional merge commit details..."
                      value={mergeOptions[pr.number]?.commit_message || ''}
                      onChange={(e) => setMergeOptions(prev => ({
                        ...prev,
                        [pr.number]: { ...prev[pr.number], commit_message: e.target.value }
                      }))}
                      rows={2}
                      style={{
                        padding: '5px 8px',
                        borderRadius: 4,
                        border: '1px solid var(--hairline)',
                        background: 'var(--surface)',
                        color: 'var(--ink)',
                        fontSize: 11,
                        resize: 'vertical'
                      }}
                    />

                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>Merge Method</label>
                    <select
                      value={mergeOptions[pr.number]?.merge_method || 'merge'}
                      onChange={(e) => setMergeOptions(prev => ({
                        ...prev,
                        [pr.number]: { ...prev[pr.number], merge_method: e.target.value }
                      }))}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        border: '1px solid var(--hairline)',
                        background: 'var(--surface)',
                        color: 'var(--ink)',
                        fontSize: 11
                      }}
                    >
                      <option value="merge">Create a merge commit</option>
                      <option value="squash">Squash and merge</option>
                      <option value="rebase">Rebase and merge</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button
                      onClick={() => handleMergePr(pr.number)}
                      disabled={mergingPr[pr.number]}
                      style={{
                        flex: 1,
                        padding: '6px 12px',
                        borderRadius: 6,
                        background: 'var(--ps-green)',
                        color: 'white',
                        border: 'none',
                        fontWeight: 700,
                        cursor: 'pointer',
                        textAlign: 'center'
                      }}
                    >
                      {mergingPr[pr.number] ? 'Merging...' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setShowMergeConfirm(prev => ({ ...prev, [pr.number]: false }))}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        background: 'transparent',
                        color: 'var(--ink-soft)',
                        border: '1px solid var(--hairline)',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  {ci.status === 'success' ? (
                    <button
                      onClick={() => setShowMergeConfirm(prev => ({ ...prev, [pr.number]: true }))}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 6,
                        background: 'var(--ps-green)',
                        color: 'white',
                        border: 'none',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        boxShadow: 'var(--shadow-card)'
                      }}
                    >
                      <Icon.Check size={14} /> Merge Pull Request
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                      <button
                        disabled
                        style={{
                          padding: '8px 16px',
                          borderRadius: 6,
                          background: 'var(--surface-2)',
                          color: 'var(--ink-faint)',
                          border: '1px solid var(--hairline)',
                          fontWeight: 800,
                          cursor: 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        Merge Blocked
                      </button>
                      <div style={{
                        fontSize: 11,
                        color: 'var(--ink-soft)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}>
                        <Icon.Info size={12} /> CI checks must pass before merging.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  });
}

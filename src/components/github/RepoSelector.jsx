import React from 'react';
import { Icon } from '../Icons.jsx';

export function RepoSelector({
  selectedRepo,
  isEditingRepo,
  setIsEditingRepo,
  repoInput,
  setRepoInput,
  projectRepoOptions,
  handleSelectRepo,
  activeTab,
  fetchPulls,
  fetchIssues,
}) {
  return (
    <div style={{
      padding: '10px 14px',
      borderBottom: '1px solid var(--hairline)',
      background: 'var(--surface-2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      flexWrap: 'wrap'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 260 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-faint)', letterSpacing: '0.05em' }}>Repo:</span>
        {isEditingRepo ? (
          <div style={{ display: 'flex', gap: 6, flex: 1 }}>
            {projectRepoOptions.length > 0 && (
              <select
                value={selectedRepo}
                onChange={(e) => handleSelectRepo(e.target.value)}
                style={{
                  padding: '5px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--hairline)',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  fontSize: 12,
                  outline: 'none',
                }}
              >
                <option value="" disabled>-- Select workspace project repo --</option>
                {projectRepoOptions.map(opt => (
                  <option key={opt.repo} value={opt.repo}>{opt.name} ({opt.repo})</option>
                ))}
              </select>
            )}
            <input
              type="text"
              placeholder="owner/repo (e.g. facebook/react)"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSelectRepo(repoInput);
                if (e.key === 'Escape' && selectedRepo) setIsEditingRepo(false);
              }}
              style={{
                flex: 1,
                padding: '5px 8px',
                borderRadius: 6,
                border: '1px solid var(--hairline)',
                background: 'var(--surface)',
                color: 'var(--ink)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                outline: 'none',
              }}
            />
            <button
              onClick={() => handleSelectRepo(repoInput || selectedRepo)}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                fontWeight: 700,
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              Set
            </button>
            {selectedRepo && (
              <button
                onClick={() => setIsEditingRepo(false)}
                style={{
                  padding: '5px 8px',
                  borderRadius: 6,
                  background: 'transparent',
                  color: 'var(--ink-soft)',
                  border: '1px solid var(--hairline)',
                  fontSize: 11,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{selectedRepo}</span>
            <button
              onClick={() => {
                setRepoInput(selectedRepo);
                setIsEditingRepo(true);
              }}
              title="Change repository"
              style={{
                background: 'none',
                border: 'none',
                padding: 4,
                color: 'var(--ink-soft)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                borderRadius: 4
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <Icon.Edit size={12} />
            </button>
          </div>
        )}
      </div>

      {selectedRepo && (
        <button
          onClick={activeTab === 'pulls' ? fetchPulls : fetchIssues}
          title="Refresh list"
          style={{
            all: 'unset',
            cursor: 'pointer',
            width: 26,
            height: 26,
            borderRadius: 6,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--surface)',
            border: '1px solid var(--hairline)',
            color: 'var(--ink-soft)',
          }}
        >
          <Icon.Refresh size={13} />
        </button>
      )}
    </div>
  );
}

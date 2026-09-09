import React from 'react';

export function TabHeader({
  selectedRepo,
  activeTab,
  setActiveTab,
  pullsCount,
  issuesCount,
}) {
  if (!selectedRepo) return null;

  return (
    <div style={{
      display: 'flex',
      borderBottom: '1px solid var(--hairline)',
      background: 'var(--surface-2)',
      padding: '0 8px'
    }}>
      {[
        { id: 'pulls', label: 'Pull Requests', count: pullsCount },
        { id: 'issues', label: 'Issues', count: issuesCount },
        { id: 'create-issue', label: 'Create Issue' },
      ].map(tab => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          style={{
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
            color: activeTab === tab.id ? 'var(--accent)' : 'var(--ink-soft)',
            fontWeight: activeTab === tab.id ? 700 : 500,
            fontSize: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            outline: 'none',
            transition: 'color 0.15s, border-color 0.15s'
          }}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              background: activeTab === tab.id ? 'var(--accent)' : 'var(--surface)',
              color: activeTab === tab.id ? 'white' : 'var(--ink-soft)',
              padding: '1px 5px',
              borderRadius: 10,
              border: '1px solid var(--hairline)',
              fontFamily: 'var(--font-mono)'
            }}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

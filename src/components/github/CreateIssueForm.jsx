import React from 'react';

export function CreateIssueForm({
  handleCreateIssue,
  createIssueResult,
  newIssueTitle,
  setNewIssueTitle,
  newIssueBody,
  setNewIssueBody,
  newIssueLabels,
  setNewIssueLabels,
  creatingIssue,
}) {
  return (
    <form onSubmit={handleCreateIssue} style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      maxWidth: 540,
      margin: '0 auto',
      width: '100%',
      padding: 8
    }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, borderBottom: '1px solid var(--hairline)', paddingBottom: 6 }}>Create New Issue</h3>

      {createIssueResult && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 6,
          background: 'color-mix(in oklch, var(--ps-green) 10%, transparent)',
          border: '1px solid color-mix(in oklch, var(--ps-green) 35%, transparent)',
          color: 'var(--ps-green)',
          fontSize: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 4
        }}>
          <div style={{ fontWeight: 700 }}>Issue Created Successfully!</div>
          <div>
            Issue <a href={createIssueResult.url} target="_blank" rel="noreferrer" style={{ color: 'var(--ps-green)', textDecoration: 'underline', fontWeight: 600 }}>#{createIssueResult.number}</a> is live on GitHub.
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 6 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)' }}>Issue Title *</label>
        <input
          type="text"
          required
          placeholder="What is the bug or task?"
          value={newIssueTitle}
          onChange={(e) => setNewIssueTitle(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid var(--hairline)',
            background: 'var(--surface-2)',
            color: 'var(--ink)',
            fontSize: 12,
            outline: 'none'
          }}
        />
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)' }}>Description / Body</label>
        <textarea
          placeholder="Provide detailed description of the issue..."
          value={newIssueBody}
          onChange={(e) => setNewIssueBody(e.target.value)}
          rows={6}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid var(--hairline)',
            background: 'var(--surface-2)',
            color: 'var(--ink)',
            fontSize: 12,
            outline: 'none',
            resize: 'vertical'
          }}
        />
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)' }}>Labels (comma-separated)</label>
        <input
          type="text"
          placeholder="bug, enhancement, question"
          value={newIssueLabels}
          onChange={(e) => setNewIssueLabels(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid var(--hairline)',
            background: 'var(--surface-2)',
            color: 'var(--ink)',
            fontSize: 12,
            outline: 'none'
          }}
        />
      </div>

      <button
        type="submit"
        disabled={creatingIssue || !newIssueTitle.trim()}
        style={{
          padding: '10px 16px',
          borderRadius: 8,
          background: 'var(--accent)',
          color: 'white',
          border: 'none',
          fontWeight: 700,
          fontSize: 12,
          cursor: 'pointer',
          alignSelf: 'flex-start',
          boxShadow: 'var(--shadow-card)',
          opacity: (creatingIssue || !newIssueTitle.trim()) ? 0.5 : 1
        }}
      >
        {creatingIssue ? 'Creating Issue...' : 'Create Issue'}
      </button>
    </form>
  );
}

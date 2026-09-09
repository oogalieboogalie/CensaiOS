import React from 'react';
import { Panel, CompactList, Row, statusTone, fmtTime } from './OperationsShared.jsx';

export function JulesPanel({ jules, includeCompleted, setIncludeCompleted }) {
  return (
    <Panel title="Jules Sessions" action={
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--ink-faint)' }}>
        <input type="checkbox" checked={includeCompleted} onChange={(e) => setIncludeCompleted(e.target.checked)} />
        completed
      </label>
    }>
      <CompactList
        items={jules.slice(0, 8)}
        empty="No Jules sessions in scope."
        render={(session) => (
          <Row
            key={session.id || session.session}
            dotTone={statusTone(session.status)}
            title={session.title || session.session}
            meta={[
              session.agentTaskStatus ? `task ${session.agentTaskStatus}` : null,
              session.reviewState ? `review ${session.reviewState}` : null,
              session.prState ? `PR ${session.prState}` : session.status,
              session.projectName,
              session.branch,
              `checked ${fmtTime(session.lastPolledAt)}`,
            ].filter(Boolean).join(' · ')}
            right={session.prUrl ? `PR #${session.prNumber || ''}` : session.agentTaskId ? 'task' : session.julesUrl ? 'Jules' : ''}
            href={session.prUrl || session.julesUrl}
          />
        )}
      />
    </Panel>
  );
}

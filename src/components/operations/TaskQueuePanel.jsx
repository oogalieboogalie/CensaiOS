import React from 'react';
import { Panel, CompactList, Row, statusTone, fmtTime } from './OperationsShared.jsx';
import { TaskResultModal, ReceiptModal } from './TaskModals.jsx';

export function TaskQueuePanel({ tasks, subAgents }) {
  const [selectedTask, setSelectedTask] = React.useState(null);
  const [selectedReceipt, setSelectedReceipt] = React.useState(null);
  const receipts = React.useMemo(() => tasks
    .filter(task => task.completion_receipt)
    .sort((a, b) => new Date(b.completed_at || b.updated_at || 0) - new Date(a.completed_at || a.updated_at || 0))
    .slice(0, 5), [tasks]);

  return (
    <>
      <Panel title="Completion Receipts">
        <CompactList
          items={receipts}
          empty="No finished agent work yet."
          render={(task) => {
            const receipt = task.completion_receipt || {};
            const summary = Array.isArray(receipt.summary) ? receipt.summary[0] : null;
            return (
              <Row
                key={`receipt-${task.id}`}
                dotTone={statusTone(receipt.status || task.status)}
                title={receipt.title || task.title || 'Completed agent work'}
                meta={[receipt.source === 'jules' ? 'Jules-backed run' : receipt.source === 'handoff' ? 'handoff' : 'agent task', summary].filter(Boolean).join(' · ')}
                right={fmtTime(receipt.completedAt || task.completed_at)}
                onClick={() => setSelectedReceipt({ task, receipt })}
              />
            );
          }}
        />
      </Panel>

      <Panel title="Agent Task Queue">
        <CompactList
          items={tasks.slice(0, 12)}
          empty="No delegated agent tasks."
          render={(task) => {
            const sub = subAgents.find(agent => agent.id === task.assignee_id);
            const canOpenResult = task.status === 'completed' || Boolean(task.result || task.error);
            const julesMeta = task.jules_pr_state ? `Jules PR ${task.jules_pr_state}` : task.jules_status ? `Jules ${task.jules_status}` : null;
            return (
              <Row
                key={task.id}
                dotTone={statusTone(task.error ? 'failed' : task.status || 'queued')}
                title={task.title || 'Untitled delegated task'}
                meta={[task.status || 'queued', sub?.name || task.assignee_id, julesMeta, task.jules_review_state ? `review ${task.jules_review_state}` : null, task.priority || 'normal', task.project].filter(Boolean).join(' · ')}
                right={task.error ? 'error' : task.jules_pr_number ? `PR #${task.jules_pr_number}` : task.completed_at ? fmtTime(task.completed_at) : task.started_at ? fmtTime(task.started_at) : ''}
                onClick={canOpenResult ? () => setSelectedTask(task) : undefined}
              />
            );
          }}
        />
      </Panel>

      {selectedTask && <TaskResultModal task={selectedTask} onClose={() => setSelectedTask(null)} />}
      {selectedReceipt && <ReceiptModal task={selectedReceipt.task} receipt={selectedReceipt.receipt} onClose={() => setSelectedReceipt(null)} />}
    </>
  );
}

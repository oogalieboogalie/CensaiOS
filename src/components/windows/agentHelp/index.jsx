import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { renderMarkdown } from '../../../lib/renderMarkdown.jsx';
import { useWorkspaceStore } from '../../../lib/store.js';
import { createAgentNetworkClient } from '../../../lib/agentRegistry/networkClient.js';
import { showWindow } from '../../../lib/agentNetwork/askBoardAgent.js';
import { useHelpCardSync } from '../../../lib/agentNetwork/useHelpCardSync.js';
import { windowMeta } from './meta.js';
import { receiptLine } from '../../../lib/agentNetwork/receiptText.js';

export { windowMeta };

// One agent asking another for help, sitting on the canvas between the two
// windows. Everyone on the board sees the same card: who asked, who is
// helping, where it stands, and the answer once it lands.

const STATUS_LABEL = {
  pending: 'Waiting for owner', waiting: 'Computer off, queued', queued: 'Queued', dispatched: 'Queued', working: 'Working',
  'needs approval': 'Needs approval', completed: 'Answered', failed: 'Failed', declined: 'Declined', cancelled: 'Withdrawn',
};
const TONE = {
  pending: 'warn', waiting: 'warn', queued: 'busy', dispatched: 'busy', working: 'busy', 'needs approval': 'warn',
  completed: 'good', failed: 'bad', declined: 'bad', cancelled: 'quiet',
};

function Party({ label, windowId, testId }) {
  const exists = useWorkspaceStore((state) => Boolean(windowId) && state.wins.some((win) => win.id === windowId));
  if (!exists) return <span className="an-party" data-testid={testId}>{label}</span>;
  return (
    <button type="button" className="an-party an-party--link" data-testid={testId}
      title={`Show ${label}`} onClick={(e) => { e.stopPropagation(); showWindow(windowId); }}>
      {label}
    </button>
  );
}

export function AgentHelpWindow({ win = {}, onUpdate, onSpawn }) {
  useHelpCardSync(win, onUpdate);
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const [busy, setBusy] = React.useState(false);
  const status = win.status || 'queued';

  const withdraw = async () => {
    setBusy(true);
    try {
      await createAgentNetworkClient({ workspaceId }).cancelHelpRequest(win.helpRequestId);
      onUpdate?.({ status: 'cancelled' });
    } catch (error) {
      onUpdate?.({ error: error.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <WindowTitle label="Help request" />
      <div className="an-card" data-testid="agent-help-card" data-status={status}>
        <div className="an-route">
          <Party label={win.fromLabel || 'A teammate'} windowId={win.fromWindowId} testId="agent-help-from" />
          <Icon.ArrowRight size={12} />
          <Party label={win.toLabel || 'Agent'} windowId={win.toWindowId} testId="agent-help-to" />
          <span className={`an-pill an-pill--${TONE[status] || 'quiet'}`} data-testid="agent-help-status">
            {STATUS_LABEL[status] || status}
          </span>
        </div>
        {['queued', 'dispatched', 'working'].includes(status) && <div className="an-progress" data-testid="agent-help-progress" />}
        <div className="an-task" title={win.task}>{win.task}</div>
        {win.result && (
          <div className="an-result" data-testid="agent-help-result">{renderMarkdown(win.result, { compact: true })}</div>
        )}
        {win.error && <div className="an-error" role="alert">{win.error}</div>}
        {win.receipt && <div className="an-receipt" data-testid="agent-help-receipt" data-verified={win.receipt.verified ? 'true' : 'false'}>{receiptLine(win.receipt)}</div>}
        {!win.result && !win.error && (
          <div className="an-wait">
            {status === 'pending' ? 'The agent\'s owner has to accept before it runs.'
              : status === 'waiting' ? 'That agent\'s computer is off. The question waits at the relay and is answered when it is back.'
              : status === 'needs approval' ? 'The coding agent is waiting for someone to allow a step in its console.'
              : 'The answer appears here and in the asking window.'}
          </div>
        )}
        <div className="an-actions">
          {win.deliveredAt && <span className="an-note"><Icon.Check size={11} /> Sent back to {win.fromLabel}</span>}
          {win.executor === 'network' && status === 'pending' && (
            <button type="button" className="an-btn" disabled={busy} onClick={withdraw} data-testid="agent-help-withdraw">Withdraw</button>
          )}
          {win.executor === 'cli' && win.cliTaskId && (
            <button type="button" className="an-btn" data-testid="agent-help-open-task"
              onClick={() => onSpawn?.('agentConsole', { taskId: win.cliTaskId, title: win.toLabel })}>Open task</button>
          )}
        </div>
      </div>
    </>
  );
}

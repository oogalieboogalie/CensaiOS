import { Icon } from '../../Icons.jsx';
import { AgentRow, RunLogItem, RunCard } from './VexComponents.jsx';

// An empty tab, the shared way: an icon tile, a title and one line of help.
function Empty({ icon, title, children }) {
  return (
    <div className="hb-empty">
      <div className="hb-empty-icon">{icon}</div>
      <div className="hb-empty-title">{title}</div>
      <div className="hb-empty-text">{children}</div>
    </div>
  );
}

export function RegistryTab({ agents, isRunning }) {
  if (agents.length === 0) {
    return (
      <Empty icon={<Icon.Inbox size={24} />} title="No agents found">
        Check the Vex registry.
      </Empty>
    );
  }
  return (
    <div className="hb-well vex-tray">
      {agents.map((agent) => (
        <AgentRow key={agent.name} agent={agent} isRunning={isRunning} />
      ))}
    </div>
  );
}

export function RunTab({
  activeRunId,
  isRunning,
  activeMeta,
  runComplete,
  agentsSucceeded,
  agentsTotal,
  activeEvents,
  activeRunData,
  logEndRef,
}) {
  if (!activeRunId && !isRunning) {
    return (
      <Empty icon={<Icon.Play size={24} />} title="No active run">
        Press <strong>Run all agents</strong>, or pick a run from History.
      </Empty>
    );
  }
  const allGood = agentsSucceeded === agentsTotal;
  const aggregate = activeRunData?.aggregate;
  return (
    <div className="vex-run">
      <div className="hb-panel vex-run-head">
        <div className="vex-run-what">
          <div className="vex-run-id">{activeRunId}</div>
          {activeMeta && (
            <div className="vex-run-task">
              Task: <strong>{activeMeta.task}</strong>
              {runComplete && ` · ${agentsSucceeded}/${agentsTotal} agents succeeded`}
            </div>
          )}
        </div>
        {isRunning && (
          <div className="vex-run-state" data-tone="busy">
            <span className="vex-spin">⟳</span>
            Orchestrating…
          </div>
        )}
        {runComplete && (
          <div className="vex-run-state" data-tone={allGood ? 'good' : 'warn'}>
            {allGood ? '✓ Complete' : `⚠ ${agentsTotal - agentsSucceeded} failed`}
          </div>
        )}
      </div>

      {activeMeta?.agents?.length > 0 && (
        <div className="vex-results">
          {activeMeta.agents.map((a, i) => (
            <div key={i} className="vex-result">
              <span className="vex-result-mark" data-ok={a.success ? 'true' : 'false'}>{a.success ? '✓' : '✗'}</span>
              <span className="vex-result-name">{a.agent_name}</span>
              <span className="vex-result-text">
                {a.success ? `${a.duration_ms}ms${a.validated ? ' · validated' : ''}` : (a.error || `exit ${a.exit_code}`)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="hb-well vex-log">
        {activeEvents.length === 0 && isRunning && (
          <div className="vex-log-wait">Waiting for events…</div>
        )}
        {activeEvents.map((e, i) => <RunLogItem key={i} event={e} />)}
        <div ref={logEndRef} />
      </div>

      {aggregate && Object.keys(aggregate).length > 0 && (
        <div className="hb-well vex-aggregate">
          <div className="vex-aggregate-title">Aggregated Result</div>
          <pre className="vex-aggregate-text">
            {JSON.stringify(aggregate, null, 2).slice(0, 2000)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function HistoryTab({ runs, activeRunId, loadRun }) {
  if (runs.length === 0) {
    return (
      <Empty icon={<Icon.History size={24} />} title="No runs yet">
        Runs you start show up here.
      </Empty>
    );
  }
  return (
    <div className="hb-well vex-tray">
      {runs.map((run) => (
        <RunCard
          key={run.run_id}
          run={run}
          isActive={run.run_id === activeRunId}
          onClick={() => loadRun(run.run_id)}
        />
      ))}
    </div>
  );
}

export function ConfigTab({
  taskInput, setTaskInput,
  filterInput, setFilterInput,
  payloadInput, setPayloadInput,
}) {
  return (
    <div className="vex-config">
      <div className="vex-config-title">Run Configuration</div>

      <label className="vex-field">
        <span className="vex-field-label">Task name</span>
        <input
          className="vex-input"
          value={taskInput}
          onChange={(e) => setTaskInput(e.target.value)}
          placeholder="demo"
        />
      </label>

      <label className="vex-field">
        <span className="vex-field-label">Filter (capability or tag)</span>
        <input
          className="vex-input"
          value={filterInput}
          onChange={(e) => setFilterInput(e.target.value)}
          placeholder="Leave blank to run all agents"
        />
      </label>

      <label className="vex-field">
        <span className="vex-field-label">Payload (JSON)</span>
        <textarea
          className="vex-input vex-input--code"
          value={payloadInput}
          onChange={(e) => setPayloadInput(e.target.value)}
          rows={4}
        />
      </label>

      <div className="vex-tip">
        <strong>Tip:</strong> Agents receive <code className="hb-code">{'{ task, payload }'}</code> as input.
        <br />Set <code className="hb-code">payload.repo_path</code> for repo_mapper, <code className="hb-code">payload.file_path</code> for code_reviewer.
      </div>
    </div>
  );
}

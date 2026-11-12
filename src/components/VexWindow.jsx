import { useVex } from './windows/vex/useVex.js';
import { WindowTitle } from './Windows.jsx';
import { RegistryTab, RunTab, HistoryTab, ConfigTab } from './windows/vex/VexTabs.jsx';
import './windows/vex/vex.css';

export function VexWindow({ win }) {
  const {
    tab, setTab,
    agents, runs,
    activeRunId, activeRunData,
    isRunning,
    taskInput, setTaskInput,
    filterInput, setFilterInput,
    payloadInput, setPayloadInput,
    error, setError,
    logEndRef,
    triggerRun, loadRun,
  } = useVex();

  const activeEvents = activeRunData?.events || [];
  const activeMeta = activeRunData?.meta;
  const runComplete = !!activeMeta?.completed_at;
  const agentsSucceeded = activeMeta?.agents_succeeded ?? 0;
  const agentsTotal = activeMeta?.agents_dispatched ?? 0;

  return (
    <div className="vex">
      <WindowTitle
        icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
        label="Vex Orchestrator"
        subtitle={`${agents.length} agent${agents.length !== 1 ? 's' : ''} registered`}
        actions={[{
          id: 'run-all',
          label: isRunning ? 'Running…' : 'Run all agents',
          title: isRunning ? 'A run is in progress' : 'Dispatch the task to every registered agent',
          onSelect: () => { if (!isRunning) triggerRun(); },
          pressed: isRunning,
        }]}
      />

      {/* Tabs: a bar across the window. The chosen one is marked for readers too. */}
      <div className="hb-bar vex-tabs">
        {[
          { id: 'registry', label: 'Registry' },
          { id: 'run', label: isRunning ? '⟳ Live Run' : 'Run Log' },
          { id: 'history', label: 'History' },
          { id: 'config', label: 'Config' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            className="vex-tab"
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="vex-error" role="alert">
          <span className="vex-error-text">⚠ {error}</span>
          <button type="button" className="vex-error-close" aria-label="Dismiss" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Tab Content */}
      <div className="vex-body">
        {tab === 'registry' && <RegistryTab agents={agents} isRunning={isRunning} />}
        {tab === 'run' && (
          <RunTab
            activeRunId={activeRunId}
            isRunning={isRunning}
            activeMeta={activeMeta}
            runComplete={runComplete}
            agentsSucceeded={agentsSucceeded}
            agentsTotal={agentsTotal}
            activeEvents={activeEvents}
            activeRunData={activeRunData}
            logEndRef={logEndRef}
          />
        )}
        {tab === 'history' && <HistoryTab runs={runs} activeRunId={activeRunId} loadRun={loadRun} />}
        {tab === 'config' && (
          <ConfigTab
            taskInput={taskInput}
            setTaskInput={setTaskInput}
            filterInput={filterInput}
            setFilterInput={setFilterInput}
            payloadInput={payloadInput}
            setPayloadInput={setPayloadInput}
          />
        )}
      </div>
    </div>
  );
}

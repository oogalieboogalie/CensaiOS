import React from 'react';
import { useVex } from './windows/vex/useVex.js';
import { WindowTitle } from './Windows.jsx';
import { RegistryTab, RunTab, HistoryTab, ConfigTab } from './windows/vex/VexTabs.jsx';

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface)', overflow: 'hidden' }}>
      <style>{`
        @keyframes vex-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.4)} }
        @keyframes vex-spin { to{transform:rotate(360deg)} }
      `}</style>

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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, padding: '4px 18px 0', borderBottom: '1px solid var(--hairline)' }}>
        {[
          { id: 'registry', label: 'Registry' },
          { id: 'run', label: isRunning ? '⟳ Live Run' : activeRunId ? 'Run Log' : 'Run Log' },
          { id: 'history', label: 'History' },
          { id: 'config', label: 'Config' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            all: 'unset', cursor: 'pointer',
            padding: '6px 14px', fontSize: 'var(--text-sm)', fontWeight: tab === t.id ? 600 : 400,
            color: tab === t.id ? 'var(--accent)' : 'var(--ink-soft)',
            borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1, transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ margin: '10px 18px 0', padding: '8px 12px', borderRadius: 'var(--radius-lg)', background: 'color-mix(in oklab, var(--danger) 13%, transparent)', border: '1px solid color-mix(in oklab, var(--danger) 27%, transparent)', fontSize: 'var(--text-sm)', color: 'var(--danger)' }}>
          ⚠ {error}
          <button onClick={() => setError(null)} style={{ all: 'unset', cursor: 'pointer', marginLeft: 8, color: 'var(--danger)', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 6px' }}>
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

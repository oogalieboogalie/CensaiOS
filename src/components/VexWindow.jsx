import React from 'react';
import { useVex } from './windows/vex/useVex.js';
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

      {/* Header */}
      <div style={{
        padding: '28px 18px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'linear-gradient(135deg, #a855f7, #6366f1)',
            display: 'grid', placeItems: 'center',
            boxShadow: '0 4px 12px #a855f733',
            flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
              Vex Orchestrator
            </div>
            <div style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 1 }}>
              {agents.length} agent{agents.length !== 1 ? 's' : ''} registered
            </div>
          </div>
        </div>
        <button
          onClick={triggerRun}
          disabled={isRunning}
          style={{
            all: 'unset', cursor: isRunning ? 'not-allowed' : 'pointer',
            padding: '7px 16px', borderRadius: 10,
            background: isRunning ? 'var(--accent-soft)' : 'linear-gradient(135deg, #a855f7, #6366f1)',
            color: isRunning ? 'var(--accent)' : 'white',
            fontWeight: 600, fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 6,
            boxShadow: isRunning ? 'none' : '0 2px 12px #6366f144',
            transition: 'all 0.2s',
            opacity: isRunning ? 0.7 : 1,
          }}
        >
          {isRunning ? (
            <>
              <span style={{ display: 'inline-block', animation: 'vex-spin 0.8s linear infinite', fontSize: 14 }}>⟳</span>
              Running…
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3" fill="white"/></svg>
              Run All Agents
            </>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, padding: '12px 18px 0', borderBottom: '1px solid var(--hairline)', marginTop: 14 }}>
        {[
          { id: 'registry', label: 'Registry' },
          { id: 'run', label: isRunning ? '⟳ Live Run' : activeRunId ? 'Run Log' : 'Run Log' },
          { id: 'history', label: 'History' },
          { id: 'config', label: 'Config' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            all: 'unset', cursor: 'pointer',
            padding: '6px 14px', fontSize: 12, fontWeight: tab === t.id ? 600 : 400,
            color: tab === t.id ? 'var(--accent, #6366f1)' : 'var(--ink-soft)',
            borderBottom: tab === t.id ? '2px solid var(--accent, #6366f1)' : '2px solid transparent',
            marginBottom: -1, transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ margin: '10px 18px 0', padding: '8px 12px', borderRadius: 8, background: '#ff475722', border: '1px solid #ff475744', fontSize: 12, color: '#ff4757' }}>
          ⚠ {error}
          <button onClick={() => setError(null)} style={{ all: 'unset', cursor: 'pointer', marginLeft: 8, color: '#ff4757', fontWeight: 700 }}>✕</button>
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

import React from 'react';
import { AgentRow, RunLogItem, RunCard } from './VexComponents.jsx';

export function RegistryTab({ agents, isRunning }) {
  return (
    <div>
      {agents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-faint)', fontSize: 12 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
          No agents found. Check the Vex registry.
        </div>
      ) : agents.map(agent => (
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {!activeRunId && !isRunning ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-faint)', fontSize: 12 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚡</div>
          No active run. Hit <strong>Run All Agents</strong> or pick a run from History.
        </div>
      ) : (
        <>
          {/* Run header */}
          <div style={{ padding: '0 12px 10px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}>
                {activeRunId}
              </div>
              {activeMeta && (
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>
                  Task: <strong>{activeMeta.task}</strong>
                  {runComplete && ` · ${agentsSucceeded}/${agentsTotal} agents succeeded`}
                </div>
              )}
            </div>
            {isRunning && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#a855f7' }}>
                <span style={{ animation: 'vex-spin 0.8s linear infinite', display: 'inline-block' }}>⟳</span>
                Orchestrating…
              </div>
            )}
            {runComplete && (
              <div style={{ fontSize: 11, color: agentsSucceeded === agentsTotal ? '#2ed573' : '#ffa502', fontWeight: 600 }}>
                {agentsSucceeded === agentsTotal ? '✓ Complete' : `⚠ ${agentsTotal - agentsSucceeded} failed`}
              </div>
            )}
          </div>

          {/* Per-agent results */}
          {activeMeta?.agents?.length > 0 && (
            <div style={{ padding: '0 12px 10px' }}>
              {activeMeta.agents.map((a, i) => {
                const color = a.success ? '#2ed573' : '#ff4757';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 11 }}>
                    <span style={{ color, fontSize: 14 }}>{a.success ? '✓' : '✗'}</span>
                    <span style={{ fontWeight: 600, color: 'var(--ink)', minWidth: 120 }}>{a.agent_name}</span>
                    <span style={{ color: 'var(--ink-soft)' }}>
                      {a.success ? `${a.duration_ms}ms${a.validated ? ' · validated' : ''}` : (a.error || `exit ${a.exit_code}`)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Event log */}
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px', background: 'rgba(0,0,0,0.15)', borderRadius: 10, margin: '0 6px', fontFamily: 'var(--font-mono)', minHeight: 120 }}>
            {activeEvents.length === 0 && isRunning && (
              <div style={{ color: 'var(--ink-faint)', fontSize: 11 }}>Waiting for events…</div>
            )}
            {activeEvents.map((e, i) => <RunLogItem key={i} event={e} />)}
            <div ref={logEndRef} />
          </div>

          {/* Aggregate result */}
          {activeRunData?.aggregate && Object.keys(activeRunData.aggregate).length > 0 && (
            <div style={{ margin: '10px 6px 0', padding: '10px 12px', background: 'rgba(0,0,0,0.12)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 6 }}>Aggregated Result</div>
              <pre style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', overflow: 'auto', maxHeight: 160, margin: 0 }}>
                {JSON.stringify(activeRunData.aggregate, null, 2).slice(0, 2000)}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function HistoryTab({ runs, activeRunId, loadRun }) {
  return (
    <div style={{ padding: '0 6px' }}>
      {runs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-faint)', fontSize: 12 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🗂</div>
          No runs yet.
        </div>
      ) : runs.map(run => (
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
    <div style={{ padding: '0 12px' }}>
      <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 600, marginBottom: 8, marginTop: 4 }}>Run Configuration</div>

      <label style={{ display: 'block', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 4 }}>Task name</div>
        <input
          value={taskInput}
          onChange={e => setTaskInput(e.target.value)}
          placeholder="demo"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '8px 10px', borderRadius: 8, border: '1px solid var(--hairline)',
            background: 'var(--surface-raised, rgba(255,255,255,0.04))',
            color: 'var(--ink)', fontSize: 12, fontFamily: 'inherit',
            outline: 'none',
          }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 4 }}>Filter (capability or tag)</div>
        <input
          value={filterInput}
          onChange={e => setFilterInput(e.target.value)}
          placeholder="Leave blank to run all agents"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '8px 10px', borderRadius: 8, border: '1px solid var(--hairline)',
            background: 'var(--surface-raised, rgba(255,255,255,0.04))',
            color: 'var(--ink)', fontSize: 12, fontFamily: 'inherit',
            outline: 'none',
          }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 4 }}>Payload (JSON)</div>
        <textarea
          value={payloadInput}
          onChange={e => setPayloadInput(e.target.value)}
          rows={4}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '8px 10px', borderRadius: 8, border: '1px solid var(--hairline)',
            background: 'var(--surface-raised, rgba(255,255,255,0.04))',
            color: 'var(--ink)', fontSize: 11, fontFamily: 'var(--font-mono)',
            outline: 'none', resize: 'vertical',
          }}
        />
      </label>

      <div style={{ fontSize: 10, color: 'var(--ink-faint)', lineHeight: 1.6 }}>
        <strong>Tip:</strong> Agents receive <code>{"{ task, payload }"}</code> as input.
        <br />Set <code>payload.repo_path</code> for repo_mapper, <code>payload.file_path</code> for code_reviewer.
      </div>
    </div>
  );
}

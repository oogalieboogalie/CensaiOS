import React from 'react';
import { SchedulerAgentSelect } from './SchedulerAgentSelect.jsx';
import { SchedulerProjectOptions } from './SchedulerProjectOptions.jsx';
import { SchedulerDateTimeForm } from './SchedulerDateTimeForm.jsx';
import { Icon } from '../Icons.jsx';

export function SchedulerForm({ state }) {
  const {
    selectedAgentId, setSelectedAgentId,
    taskText, setTaskText,
    documentTarget, setDocumentTarget,
    schedulesError,
    handleAddSchedule
  } = state;

  return (
    <div style={{
      width: 320,
      borderRight: '1px solid var(--hairline)',
      background: 'var(--surface-50)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--hairline)', background: 'var(--surface-2)' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>New Scheduled Task</h3>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
        {schedulesError && (
          <div role="alert" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--ps-red)', background: 'var(--surface-2)', color: 'var(--ps-red)', fontSize: 11, lineHeight: 1.4 }}>
            {schedulesError}
          </div>
        )}
        <SchedulerAgentSelect selectedAgentId={selectedAgentId} setSelectedAgentId={setSelectedAgentId} />
        <SchedulerProjectOptions state={state} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Document Target (optional)</span>
          <input
            type="text"
            placeholder="e.g. week-32.md"
            value={documentTarget}
            onChange={(e) => setDocumentTarget(e.target.value)}
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 8,
              border: '1px solid var(--hairline)', background: 'var(--surface-2)',
              color: 'var(--ink)', fontSize: 13, outline: 'none'
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Task Description</span>
          <textarea
            placeholder="Describe the task for the agent to execute..."
            value={taskText}
            onChange={(e) => setTaskText(e.target.value)}
            rows={3}
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 8,
              border: '1px solid var(--hairline)', background: 'var(--surface-2)',
              color: 'var(--ink)', fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'inherit'
            }}
          />
        </div>

        <SchedulerDateTimeForm state={state} />

        <button
          onClick={handleAddSchedule}
          disabled={!taskText.trim()}
          style={{
            all: 'unset', cursor: !taskText.trim() ? 'not-allowed' : 'pointer',
            padding: '10px 16px', borderRadius: 8,
            background: 'var(--accent)', color: 'white',
            fontSize: 13, fontWeight: 700, textAlign: 'center',
            opacity: !taskText.trim() ? 0.5 : 1,
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6,
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
        >
          <><Icon.Plus size={16} /> Schedule Task</>
        </button>
      </div>
    </div>
  );
}

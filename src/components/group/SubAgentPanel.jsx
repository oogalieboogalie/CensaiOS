import React from 'react';
import { Icon } from '../Icons.jsx';
import { useSubAgentTasks } from './useSubAgentTasks.js';
import { SubAgentRoster } from './SubAgentRoster.jsx';
import { SubAgentBatch } from './SubAgentBatch.jsx';
import { TaskWorkerStatus, SubAgentTaskForm, SubAgentRecentTasks } from './SubAgentTasks.jsx';
import { groupAccent, groupSoft } from './styles.js';

export function SubAgentPanel({ subAgents, setSubAgents, groupHue, groupName, members, isActive }) {
  const [creating, setCreating] = React.useState(false);
  const [newParent, setNewParent] = React.useState(members[0]?.id || '');
  const state = useSubAgentTasks({ groupName, subAgents, members, newParent, isActive });
  const accentColor = groupAccent(groupHue);
  const softColor = groupSoft(groupHue);

  return (
    <div style={{ border: `1px solid ${accentColor}`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: softColor, borderBottom: `1px solid ${accentColor}` }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: `oklch(0.40 0.10 ${groupHue})` }}>Sub-Agents</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setCreating(true)} title="New sub-agent" style={{ all: 'unset', cursor: 'pointer', width: 22, height: 22, borderRadius: 6, border: `1px solid ${accentColor}`, background: 'var(--surface)', display: 'grid', placeItems: 'center', color: accentColor }}>
            <Icon.Plus size={12} />
          </button>
        </div>
      </div>
      <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--surface)' }}>
        {subAgents.length === 0 && !creating && (
          <div style={{ padding: '12px 8px', textAlign: 'center', fontSize: 12, color: 'var(--ink-faint)' }}>
            No sub-agents yet. Agents can create them via tools, or click + above.
          </div>
        )}
        <SubAgentRoster
          subAgents={subAgents}
          setSubAgents={setSubAgents}
          members={members}
          groupHue={groupHue}
          creating={creating}
          setCreating={setCreating}
          newParent={newParent}
          setNewParent={setNewParent}
        />
        <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, color: 'var(--ink-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0 2px' }}>
            Tasks
          </div>
          <TaskWorkerStatus
            dbReady={state.dbReady}
            workerReady={state.workerReady}
            degradedState={state.degradedState}
            workerMessage={state.workerMessage}
            loadError={state.taskLoadError}
            groupHue={groupHue}
          />
          {subAgents.length > 0 ? (
            <>
              <SubAgentBatch state={state} subAgents={subAgents} groupHue={groupHue} />
              <SubAgentTaskForm state={state} subAgents={subAgents} groupHue={groupHue} />
            </>
          ) : (
            <div style={{ padding: '6px 8px', borderRadius: 6, background: 'var(--surface-2)', fontSize: 11, color: 'var(--ink-faint)' }}>
              Create a sub-agent before delegating tasks.
            </div>
          )}
          <SubAgentRecentTasks state={state} subAgents={subAgents} groupHue={groupHue} />
        </div>
      </div>
    </div>
  );
}

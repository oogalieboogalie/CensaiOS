import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';

// Milestones, goals, and sub-agent roster for one group, backed by the API.
// Window-persisted values (win.milestones/win.goals) seed the lists until the
// fetch resolves.
export function useGroupData(groupName, win) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const [milestones, setMilestones] = React.useState(win.milestones || []);
  const [goals, setGoals] = React.useState(win.goals || []);
  const [newMilestone, setNewMilestone] = React.useState('');
  const [newGoal, setNewGoal] = React.useState('');
  const [subAgents, setSubAgents] = React.useState([]);

  React.useEffect(() => {
    fetch(`/api/milestones/${encodeURIComponent(groupName)}`).then(r => r.ok ? r.json() : []).then(d => setMilestones(Array.isArray(d) ? d : [])).catch(() => {});
    fetch(`/api/goals/${encodeURIComponent(groupName)}`).then(r => r.ok ? r.json() : []).then(d => setGoals(Array.isArray(d) ? d : [])).catch(() => {});
    if (workspaceId) {
      fetch(`/api/sub-agents?workspaceId=${encodeURIComponent(workspaceId)}`).then(r => r.ok ? r.json() : []).then(d => setSubAgents(Array.isArray(d) ? d : [])).catch(() => {});
    } else {
      setSubAgents([]);
    }
  }, [groupName, workspaceId]);

  const addMilestone = async () => {
    if (!newMilestone.trim()) return;
    try {
      const res = await fetch('/api/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupName, title: newMilestone.trim() }),
      });
      if (res.ok) {
        const m = await res.json();
        setMilestones(prev => [m, ...prev]);
        setNewMilestone('');
      }
    } catch {}
  };

  const toggleMilestone = async (id) => {
    try {
      await fetch(`/api/milestones/${id}/complete`, { method: 'PATCH' });
      setMilestones(prev => prev.map(m => m.id === id ? { ...m, completed: true, completed_at: new Date().toISOString() } : m));
    } catch {}
  };

  const addGoal = async () => {
    if (!newGoal.trim()) return;
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupName, title: newGoal.trim() }),
      });
      if (res.ok) {
        const g = await res.json();
        setGoals(prev => [g, ...prev]);
        setNewGoal('');
      }
    } catch {}
  };

  return {
    milestones, goals, subAgents, setSubAgents,
    newMilestone, setNewMilestone, newGoal, setNewGoal,
    addMilestone, toggleMilestone, addGoal,
  };
}

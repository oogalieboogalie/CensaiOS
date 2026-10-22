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
  // Why the last add or tick did not save, in the server's words.
  const [error, setError] = React.useState(null);
  const refused = async (res, fallback) => {
    const body = await res.json().catch(() => ({}));
    setError(body?.error || fallback);
  };

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
      if (!res.ok) return refused(res, 'Could not add that milestone.');
      const m = await res.json();
      setMilestones(prev => [m, ...prev]);
      setNewMilestone('');
      setError(null);
    } catch { setError('Could not add that milestone.'); }
  };

  const toggleMilestone = async (id) => {
    try {
      const res = await fetch(`/api/milestones/${id}/complete`, { method: 'PATCH' });
      if (!res.ok) return refused(res, 'Could not save that milestone.');
      setMilestones(prev => prev.map(m => m.id === id ? { ...m, completed: true, completed_at: new Date().toISOString() } : m));
      setError(null);
    } catch { setError('Could not save that milestone.'); }
  };

  const addGoal = async () => {
    if (!newGoal.trim()) return;
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupName, title: newGoal.trim() }),
      });
      if (!res.ok) return refused(res, 'Could not add that goal.');
      const g = await res.json();
      setGoals(prev => [g, ...prev]);
      setNewGoal('');
      setError(null);
    } catch { setError('Could not add that goal.'); }
  };

  return {
    milestones, goals, subAgents, setSubAgents, error,
    newMilestone, setNewMilestone, newGoal, setNewGoal,
    addMilestone, toggleMilestone, addGoal,
  };
}

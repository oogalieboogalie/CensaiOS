import React from 'react';
import { useVisibilityAwareInterval } from '../../lib/usePolling.js';
import { useWorkspaceStore } from '../../lib/store.js';

// Task-queue state for the sub-agent panel: worker health, the task list
// (polled while the window is active), single-task creation, and the batch
// coordinator (plan -> review -> queue).
export function useSubAgentTasks({ groupName, subAgents, members, newParent, isActive }) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const [tasks, setTasks] = React.useState([]);
  const [taskHealth, setTaskHealth] = React.useState(null);
  const [taskLoadError, setTaskLoadError] = React.useState('');
  const [taskAssignee, setTaskAssignee] = React.useState('');
  const [taskTitle, setTaskTitle] = React.useState('');
  const [taskPrompt, setTaskPrompt] = React.useState('');
  const [taskPriority, setTaskPriority] = React.useState('normal');
  const [batchText, setBatchText] = React.useState('');
  const [batchPlan, setBatchPlan] = React.useState(null);
  const [planningBatch, setPlanningBatch] = React.useState(false);
  const [queuingBatch, setQueuingBatch] = React.useState(false);
  const [batchError, setBatchError] = React.useState('');

  const loadTaskHealth = React.useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error('Health check failed');
      const payload = await res.json();
      setTaskHealth(payload);
      return payload;
    } catch (err) {
      const fallback = {
        degraded: true,
        degradedState: 'health_unavailable',
        database: false,
        databaseStatus: { ready: false, degraded: true, degradedReason: 'health_unavailable' },
        taskWorker: {
          ready: false,
          degraded: true,
          degradedReason: 'health_unavailable',
          message: err.message || 'Health check failed',
        },
      };
      setTaskHealth(fallback);
      return fallback;
    }
  }, []);

  const loadTasks = React.useCallback(async () => {
    const health = await loadTaskHealth();
    if (!workspaceId) {
      setTasks([]);
      setTaskLoadError('Open a workspace before managing delegated tasks.');
      return;
    }
    try {
      const res = await fetch(`/api/agent-tasks?workspaceId=${encodeURIComponent(workspaceId)}`);
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.taskWorker?.message || payload?.error || 'Failed to load agent tasks');
      setTasks(Array.isArray(payload) ? payload : []);
      setTaskLoadError('');
    } catch (err) {
      setTasks([]);
      setTaskLoadError(err.message || health?.taskWorker?.message || 'Failed to load agent tasks');
    }
  }, [loadTaskHealth, workspaceId]);

  React.useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useVisibilityAwareInterval(() => {
    loadTasks();
  }, 15000, { inactive: !isActive });

  React.useEffect(() => {
    if (!taskAssignee && subAgents[0]?.id) setTaskAssignee(subAgents[0].id);
  }, [subAgents, taskAssignee]);

  const dbReady = Boolean(taskHealth?.databaseStatus?.ready ?? taskHealth?.database);
  const workerReady = Boolean(taskHealth?.taskWorker?.ready);
  const taskQueueBlocked = !workspaceId || !dbReady || !workerReady;
  const degradedState = taskHealth?.degradedState || taskHealth?.taskWorker?.degradedReason || (taskQueueBlocked ? 'unknown' : null);
  const workerMessage = !workspaceId
    ? 'Open a workspace before managing delegated tasks.'
    : taskHealth?.taskWorker?.message || (taskQueueBlocked ? 'Task worker status unavailable' : 'Agent task worker: enabled');
  const blockedTaskStatus = degradedState === 'database_unavailable' ? 'db blocked' : 'worker blocked';

  const createTask = async () => {
    if (taskQueueBlocked || !taskAssignee || !taskTitle.trim() || !taskPrompt.trim()) return;
    const assignee = subAgents.find(s => s.id === taskAssignee);
    try {
      const res = await fetch('/api/agent-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId: assignee?.parent_id || newParent || members[0]?.id || null,
          assigneeId: taskAssignee,
          project: groupName,
          title: taskTitle.trim(),
          prompt: taskPrompt.trim(),
          priority: taskPriority,
          workspaceId,
        }),
      });
      if (res.ok) {
        const task = await res.json();
        setTasks(prev => [task, ...prev]);
        setTaskTitle('');
        setTaskPrompt('');
        setTaskPriority('normal');
        await loadTaskHealth();
      } else {
        const payload = await res.json().catch(() => null);
        setTaskLoadError(payload?.taskWorker?.message || payload?.error || 'Failed to create task');
      }
    } catch (err) {
      setTaskLoadError(err.message || 'Failed to create task');
    }
  };

  const planBatch = async () => {
    if (taskQueueBlocked || !batchText.trim()) return;
    setPlanningBatch(true);
    setBatchError('');
    try {
      const res = await fetch('/api/agent-task-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: batchText.trim(),
          groupName,
          subAgentIds: subAgents.map(s => s.id),
          workspaceId,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to plan work');
      setBatchPlan(payload);
    } catch (err) {
      setBatchError(err.message || 'Failed to plan work');
    } finally {
      setPlanningBatch(false);
    }
  };

  const updatePlannedTask = (taskId, patch) => {
    setBatchPlan(plan => !plan ? plan : {
      ...plan,
      tasks: plan.tasks.map(task => task.id === taskId ? { ...task, ...patch } : task),
    });
  };

  const queueBatch = async () => {
    if (taskQueueBlocked || !batchPlan?.tasks?.length) return;
    const parentId = members[0]?.id || 'architect';
    setQueuingBatch(true);
    setBatchError('');
    try {
      const res = await fetch('/api/agent-task-plan/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId,
          project: groupName,
          batchLabel: `${groupName} coordinated batch`,
          tasks: batchPlan.tasks,
          workspaceId,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to queue batch');
      setTasks(prev => [...payload.created, ...prev]);
      setBatchText('');
      setBatchPlan(null);
      if (payload.skipped?.length) {
        setBatchError(`${payload.skipped.length} task(s) were skipped because they need an assignee.`);
      }
      await loadTaskHealth();
    } catch (err) {
      setBatchError(err.message || 'Failed to queue batch');
    } finally {
      setQueuingBatch(false);
    }
  };

  const tasksForSub = (id) => tasks.filter(t => t.assignee_id === id).slice(0, 3);

  return {
    dbReady, workerReady, taskQueueBlocked, degradedState, workerMessage, blockedTaskStatus,
    taskLoadError, tasksForSub,
    taskAssignee, setTaskAssignee, taskTitle, setTaskTitle, taskPrompt, setTaskPrompt,
    taskPriority, setTaskPriority, createTask,
    batchText, setBatchText, batchPlan, planningBatch, queuingBatch, batchError,
    planBatch, updatePlannedTask, queueBatch,
  };
}

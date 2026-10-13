import React from 'react';
import { apiFetch } from './vexApi.js';

export function useVex() {
  const [tab, setTab] = React.useState('registry');
  const [agents, setAgents] = React.useState([]);
  const [runs, setRuns] = React.useState([]);
  const [activeRunId, setActiveRunId] = React.useState(null);
  const [activeRunData, setActiveRunData] = React.useState(null);
  const [isRunning, setIsRunning] = React.useState(false);
  const [taskInput, setTaskInput] = React.useState('demo');
  const [filterInput, setFilterInput] = React.useState('');
  const [payloadInput, setPayloadInput] = React.useState('{}');
  const [error, setError] = React.useState(null);
  const logEndRef = React.useRef(null);
  const pollRef = React.useRef(null);

  // Load agents on mount
  React.useEffect(() => {
    apiFetch('/agents')
      .then(data => setAgents(data.agents || []))
      .catch(err => setError(err.message));
  }, []);

  // Load run list when switching to history tab
  React.useEffect(() => {
    if (tab === 'history') {
      apiFetch('/runs')
        .then(data => setRuns(data.runs || []))
        .catch(() => {});
    }
  }, [tab]);

  // Poll active run
  React.useEffect(() => {
    if (!activeRunId || !isRunning) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const data = await apiFetch(`/status/${activeRunId}`);
        if (!cancelled) {
          setActiveRunData(data);
          if (data.status === 'complete' || data.meta?.completed_at) {
            setIsRunning(false);
            apiFetch('/runs').then(d => setRuns(d.runs || [])).catch(() => {});
          } else {
            pollRef.current = setTimeout(poll, 1200);
          }
        }
      } catch {
        if (!cancelled) pollRef.current = setTimeout(poll, 2000);
      }
    };
    pollRef.current = setTimeout(poll, 1200);
    return () => { cancelled = true; clearTimeout(pollRef.current); };
  }, [activeRunId, isRunning]);

  // Auto-scroll log
  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeRunData?.events]);

  const triggerRun = async () => {
    if (isRunning) return;
    setError(null);
    setIsRunning(true);
    setTab('run');
    setActiveRunData(null);
    let payload = {};
    try { payload = JSON.parse(payloadInput); } catch {}
    try {
      const result = await apiFetch('/run', {
        method: 'POST',
        body: JSON.stringify({
          task: taskInput || 'demo',
          payload: { ...payload },
          filter: filterInput || undefined,
        }),
      });
      setActiveRunId(result.run_id);
    } catch (err) {
      setError(err.message);
      setIsRunning(false);
    }
  };

  const loadRun = async (runId) => {
    setActiveRunId(runId);
    setTab('run');
    try {
      const data = await apiFetch(`/status/${runId}`);
      setActiveRunData(data);
      setIsRunning(!data.meta?.completed_at);
    } catch (err) {
      setError(err.message);
    }
  };

  return {
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
  };
}

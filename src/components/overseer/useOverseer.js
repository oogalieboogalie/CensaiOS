import React from 'react';
import { useVisibilityAwareInterval } from '../../lib/usePolling.js';

export function useOverseer() {
  const [status, setStatus] = React.useState({
    isRunning: false,
    isAuditing: false,
    countdown: 3600,
    intervalSeconds: 3600,
    repo: '',
    lastRunTime: null,
    lastRunStatus: 'idle',
    logs: ''
  });

  const [repos, setRepos] = React.useState([]);
  const [selectedRepo, setSelectedRepo] = React.useState('custom');
  const [isCustomRepo, setIsCustomRepo] = React.useState(true);
  const [customRepoText, setCustomRepoText] = React.useState('');
  
  const [error, setError] = React.useState('');
  const logEndRef = React.useRef(null);

  const pollStatus = React.useCallback(async () => {
    try {
      const res = await fetch('/api/overseer/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        
        if (data.repo && data.repo !== selectedRepo) {
          if (repos.includes(data.repo)) {
            setSelectedRepo(data.repo);
            setIsCustomRepo(false);
          } else {
            setSelectedRepo('custom');
            setIsCustomRepo(true);
            setCustomRepoText(data.repo);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch Overseer status:', err);
    }
  }, [selectedRepo, repos]);

  React.useEffect(() => {
    const loadRepos = async () => {
      try {
        const res = await fetch('/api/repos');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const list = data.map(r => r.name);
            const unique = Array.from(new Set([...repos, ...list]));
            setRepos(unique);
          }
        }
      } catch (err) {
        console.warn('Could not load github repos dynamically:', err);
      }
    };

    loadRepos();
    pollStatus();
  }, []);

  useVisibilityAwareInterval(pollStatus, 1000);

  React.useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [status.logs]);

  const handleStart = async () => {
    setError('');
    const repo = isCustomRepo ? customRepoText.trim() : selectedRepo;
    if (!repo) {
      setError('Please provide a repository');
      return;
    }

    try {
      const res = await fetch('/api/overseer/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, intervalSeconds: 3600 })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to start');
      }
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleStop = async () => {
    setError('');
    try {
      const res = await fetch('/api/overseer/stop', { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to stop');
      }
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRunNow = async () => {
    setError('');
    try {
      const res = await fetch('/api/overseer/run', { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to trigger run');
      }
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRepoChange = (e) => {
    const val = e.target.value;
    setSelectedRepo(val);
    if (val === 'custom') {
      setIsCustomRepo(true);
    } else {
      setIsCustomRepo(false);
    }
  };

  return {
    status,
    repos,
    selectedRepo,
    isCustomRepo,
    customRepoText,
    setCustomRepoText,
    error,
    logEndRef,
    handleStart,
    handleStop,
    handleRunNow,
    handleRepoChange
  };
}

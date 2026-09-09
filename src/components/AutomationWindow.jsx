import { useState, useEffect } from 'react';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { Icon } from './Icons.jsx';
import { useVisibilityAwareInterval } from '../lib/usePolling.js';
import { AutomationRow } from './AutomationRow.jsx';

export function AutomationWindow({ win, onUpdate }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/automation/status');
      if (!res.ok) {
        throw new Error('Failed to fetch status');
      }
      const data = await res.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useVisibilityAwareInterval(fetchStatus, 3000);

  const handleAction = async (task, action) => {
    try {
      const res = await fetch(`/api/automation/${task}/${action}`, { method: 'POST' });
      if (!res.ok) {
        throw new Error(`Failed to ${action} ${task}`);
      }
      fetchStatus();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  if (loading && !status) {
    return (
      <>
        <WindowTitle
          icon={<Icon.Server size={14} />}
          label={win.title || 'Automation Board'}
        />
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-faint)' }}>
          Loading status...
        </div>
      </>
    );
  }

  if (error && !status) {
    return (
      <>
        <WindowTitle
          icon={<Icon.Server size={14} />}
          label={win.title || 'Automation Board'}
        />
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--ps-red)' }}>
          {error}
        </div>
      </>
    );
  }

  const tasks = status ? Object.keys(status) : [];

  return (
    <>
      <WindowTitle
        icon={<Icon.Server size={14} />}
        label={win.title || 'Automation Board'}
        subtitle="Scheduled Tasks"
      />
      <div style={{ flex: 1, minHeight: 0, padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--surface)' }}>
        {tasks.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-faint)' }}>
            No automation tasks configured.
          </div>
        ) : tasks.map(task => (
          <AutomationRow
            key={task}
            taskName={task}
            info={status[task]}
            onAction={handleAction}
          />
        ))}
      </div>
    </>
  );
}

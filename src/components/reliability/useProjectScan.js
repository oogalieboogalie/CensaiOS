import { useState } from 'react';
import { logToApp } from '../../lib/appLog/browserLog.js';

// "Run a scan" in the Reliability window: asks the server to score the open
// project's code, then hands back a plain-words line for the window.
export function scanSummary({ project, scanned, findings, capped }) {
  if (!scanned) return `Scanned ${project}: no code files found.`;
  const files = scanned === 1 ? '1 file' : `${scanned} files`;
  const review = findings === 1 ? '1 needs review' : `${findings} need review`;
  return `Scanned ${files} in ${project}, ${review}.${capped ? ' Stopped at the first ' + scanned + ' files.' : ''}`;
}

export function useProjectScan({ workspaceId, onDone }) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');

  const run = async () => {
    setRunning(true);
    setMessage('');
    try {
      const res = await fetch('/api/reliability/scans/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'The scan could not run.');
      setMessage(scanSummary(data));
      onDone?.();
    } catch (err) {
      setMessage(err.message);
      logToApp('warn', `reliability: scan could not run: ${err.message}`, { where: 'reliability' });
    } finally {
      setRunning(false);
    }
  };

  return { run, running, message };
}

import React from 'react';
import { HELPER_JOBS } from '../../lib/agents/nanoHelpers.js';

// "Start a helper" in a sub-agent's data box (diagram 15): pick one job, say
// what to do, paste text if the job needs it. The helper runs once on the
// sub-agent's own model and its answer lands in the box above.
export function SubAgentHelperForm({ sub, workspaceId, onDone }) {
  const [open, setOpen] = React.useState(false);
  const [job, setJob] = React.useState('review');
  const [task, setTask] = React.useState('');
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState('');

  const start = async () => {
    if (!task.trim() || busy) return;
    setBusy(true);
    setNote(`The ${job} helper is working...`);
    try {
      const res = await fetch(`/api/sub-agents/${encodeURIComponent(sub.id)}/helper`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job, task: task.trim(), input, workspaceId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'The helper could not start.');
      setNote(`The ${job} helper finished. Its answer is in the box above.`);
      setTask('');
      setInput('');
      onDone?.();
    } catch (failure) {
      setNote(failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hb-databox-door hb-databox-helper" data-testid="sub-agent-helper">
      <button type="button" className="hb-databox-door-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        Start a helper {open ? '▾' : '▸'}
      </button>
      {open && (
        <>
          <div className="hb-databox-add">
            <select value={job} onChange={e => setJob(e.target.value)} aria-label="Helper job">
              {Object.keys(HELPER_JOBS).map(name => <option key={name} value={name}>{name}</option>)}
            </select>
            <input value={task} onChange={e => setTask(e.target.value)} placeholder="What should it do?" aria-label="Helper task"
              onKeyDown={e => { if (e.key === 'Enter') start(); }} />
            <button type="button" className="hb-btn" onClick={start} disabled={!task.trim() || busy}>{busy ? 'Working' : 'Start'}</button>
          </div>
          <textarea className="hb-databox-helper-input" value={input} onChange={e => setInput(e.target.value)} rows={3}
            placeholder="Text for it to work on (optional)" aria-label="Text for the helper" />
          <p className="hb-databox-empty" role="status">{note || `${HELPER_JOBS[job]}. Uses ${sub.name}'s own model and your key.`}</p>
        </>
      )}
    </div>
  );
}

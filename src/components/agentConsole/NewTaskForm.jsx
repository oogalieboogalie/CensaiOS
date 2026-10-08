/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { CliMark, CliStatusChip } from './CliMark.jsx';
import { cliAgentsApi } from './cliAgentsApi.js';

// "New task": pick a CLI, pick a folder (an open project), type the task.
// A CLI that is not installed yet installs itself on first use.

export function NewTaskForm({ roster, initialCli, initialFolder, onStarted, onOpenSettings }) {
  const [cli, setCli] = React.useState(initialCli || 'claudecode');
  const [folders, setFolders] = React.useState([]);
  const [folder, setFolder] = React.useState(initialFolder || '');
  const [prompt, setPrompt] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    cliAgentsApi.folders().then((data) => {
      if (!alive) return;
      const list = data.folders || [];
      setFolders(list);
      if (!initialFolder && list.length) setFolder((list.find((f) => f.current) || list[0]).path);
    }).catch((err) => alive && setError(err.message));
    return () => { alive = false; };
  }, [initialFolder]);

  const selected = roster.find((c) => c.id === cli);
  const submit = async (e) => {
    e?.preventDefault();
    if (!prompt.trim() || !folder || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { task } = await cliAgentsApi.start({ cli, folder, prompt });
      onStarted(task, { cli, folder });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="ac-new" onSubmit={submit} data-testid="agent-new-task">
      <div className="ac-label">Agent</div>
      <div className="ac-cli-grid" role="radiogroup" aria-label="Coding agent">
        {roster.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={cli === c.id}
            className={`ac-cli-option${cli === c.id ? ' ac-cli-option--on' : ''}`} onClick={() => setCli(c.id)} data-testid={`pick-${c.id}`}>
            <CliMark cli={c.id} active={cli === c.id} />
            <span className="ac-cli-option-text">
              <span className="ac-cli-name">{c.label}</span>
              <CliStatusChip cli={c} />
            </span>
          </button>
        ))}
      </div>
      {selected && !selected.installed && (
        <div className="ac-hint"><Icon.Download size={12} />Installs on first use (npm {selected.npmPackage}).</div>
      )}
      {selected && selected.installed && !selected.signedIn && (
        <div className="ac-hint ac-hint--warn"><Icon.Alert size={12} />No key or login found. Add a key in <button type="button" className="ac-link" onClick={onOpenSettings}>Agents</button>, or sign in once with the CLI itself.</div>
      )}

      <label className="ac-label" htmlFor="ac-folder">Folder</label>
      {folders.length > 0 ? (
        <select id="ac-folder" className="ac-input" value={folder} onChange={(e) => setFolder(e.target.value)}>
          {folders.map((f) => <option key={f.path} value={f.path}>{f.name} · {f.path}{f.isGit ? '' : ' (not a git repo)'}</option>)}
        </select>
      ) : (
        <div className="ac-hint">Open a project from the top bar first; agents work inside a project&apos;s repo.</div>
      )}

      <label className="ac-label" htmlFor="ac-task">Task</label>
      <textarea id="ac-task" className="ac-input ac-textarea" rows={5} value={prompt} placeholder="Add a farewell() helper next to greet() with a test."
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e); }} />

      {error && <div className="ac-error" role="alert"><Icon.Alert size={13} />{error}</div>}
      <div className="ac-new-foot">
        <span className="ac-muted">{selected?.gateNote} Runs in its own git worktree.</span>
        <button type="submit" className="ac-btn ac-btn--primary" disabled={busy || !prompt.trim() || !folder} data-testid="agent-start">
          {busy ? 'Starting…' : 'Start task'}
        </button>
      </div>
    </form>
  );
}

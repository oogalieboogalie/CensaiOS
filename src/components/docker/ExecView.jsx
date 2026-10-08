import React, { useEffect, useRef, useState } from 'react';
import { DIcon } from './dockerIcons.jsx';
import { EmptyState } from './DockerUi.jsx';
import { dockerApi } from './dockerApi.js';

const QUICK = ['ls -la', 'env', 'ps aux', 'df -h', 'cat /etc/os-release'];

/** One-shot commands inside the container, with a scrollback and ↑/↓ history. */
export function ExecView({ container }) {
  const [command, setCommand] = useState('');
  const [entries, setEntries] = useState([]);
  const [running, setRunning] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const bottom = useRef(null);
  const input = useRef(null);
  useEffect(() => { bottom.current?.scrollIntoView?.({ block: 'end' }); }, [entries, running]);

  if (container.state !== 'running') {
    return (
      <EmptyState icon={<DIcon.Prompt size={26} />} title="Container isn't running">
        <p>Start it to run commands inside.</p>
      </EmptyState>
    );
  }

  const submit = async (cmd = command) => {
    const line = cmd.trim();
    if (!line || running) return;
    setRunning(true);
    setCommand('');
    setCursor(-1);
    try {
      const r = await dockerApi.exec(container.id, line);
      setEntries((e) => [...e, { cmd: line, ...r }]);
    } catch (err) {
      setEntries((e) => [...e, { cmd: line, ok: false, exitCode: null, stdout: '', stderr: err.message }]);
    } finally {
      setRunning(false);
      input.current?.focus();
    }
  };

  const onKeyDown = (e) => {
    const past = entries.map((x) => x.cmd).reverse();
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'ArrowUp' && past.length) {
      e.preventDefault();
      const next = Math.min(cursor + 1, past.length - 1);
      setCursor(next); setCommand(past[next]);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = cursor - 1;
      setCursor(Math.max(next, -1)); setCommand(next >= 0 ? past[next] : '');
    }
  };

  return (
    <div className="dk-exec">
      <div className="dk-execbox">
        {entries.length === 0 && (
          <div className="dk-exec-intro">
            Runs each command with <code>sh -c</code> inside <strong>{container.name}</strong>. Try one:
            <div className="dk-quick">
              {QUICK.map((q) => <button key={q} type="button" className="dk-chip dk-chip--btn" onClick={() => submit(q)}>{q}</button>)}
            </div>
          </div>
        )}
        {entries.map((x, i) => (
          <div key={i} className="dk-exec-entry">
            <div className="dk-exec-cmd">
              <span className="dk-prompt">$</span><span>{x.cmd}</span>
              <span className={`dk-exit ${x.ok ? 'is-ok' : 'is-err'}`}>{x.ok ? 'exit 0' : `exit ${x.exitCode ?? '?'}`}</span>
            </div>
            {x.stdout && <pre className="dk-exec-out">{x.stdout}</pre>}
            {x.stderr && <pre className="dk-exec-out is-err">{x.stderr}</pre>}
          </div>
        ))}
        {running && <div className="dk-exec-running"><span className="dk-spinner" /> running…</div>}
        <div ref={bottom} />
      </div>
      <div className="dk-exec-input">
        <span className="dk-prompt">$</span>
        <input ref={input} value={command} onChange={(e) => setCommand(e.target.value)} onKeyDown={onKeyDown}
          placeholder="Type a command and press Enter" aria-label="Command to run in the container" spellCheck={false} disabled={running} />
      </div>
    </div>
  );
}

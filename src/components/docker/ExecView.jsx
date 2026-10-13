import React, { useEffect, useRef, useState } from 'react';
import { DIcon } from './dockerIcons.jsx';
import { EmptyState, IconButton } from './DockerUi.jsx';
import { AnsiText, stripAnsi } from './ansi.jsx';
import { dockerApi } from './dockerApi.js';

const QUICK = ['ls -la', 'env', 'ps aux', 'df -h', 'cat /etc/os-release'];

/**
 * Measure how many monospace columns and rows fit in the output box and keep
 * it current as the window resizes, so commands wrap to what you can see.
 */
function useTerminalSize(boxRef, probeRef) {
  const [size, setSize] = useState({ cols: 0, rows: 0 });
  useEffect(() => {
    const box = boxRef.current;
    const probe = probeRef.current;
    if (!box || !probe || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const ch = probe.getBoundingClientRect();
      const charW = ch.width / 10 || 7;
      const lineH = ch.height || 18;
      const cs = getComputedStyle(box);
      const innerW = box.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0) - 40;
      const cols = Math.max(20, Math.floor(innerW / charW));
      const rows = Math.max(5, Math.floor(box.clientHeight / lineH));
      setSize((s) => (s.cols === cols && s.rows === rows ? s : { cols, rows }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [boxRef, probeRef]);
  return size;
}

/** One-shot commands inside the container, with colours, scrollback and ↑/↓ history. */
export function ExecView({ container }) {
  const [command, setCommand] = useState('');
  const [entries, setEntries] = useState([]);
  const [running, setRunning] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const bottom = useRef(null);
  const input = useRef(null);
  const box = useRef(null);
  const probe = useRef(null);
  const size = useTerminalSize(box, probe);
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
    if (line === 'clear') { setEntries([]); setCommand(''); return; }
    setRunning(true);
    setCommand('');
    setCursor(-1);
    const started = Date.now();
    try {
      const r = await dockerApi.exec(container.id, line, size.cols ? size : {});
      setEntries((e) => [...e, { cmd: line, durationMs: Date.now() - started, ...r }]);
    } catch (err) {
      setEntries((e) => [...e, { cmd: line, ok: false, exitCode: null, stdout: '', stderr: err.message, durationMs: Date.now() - started }]);
    } finally {
      setRunning(false);
      input.current?.focus();
    }
  };

  const onKeyDown = (e) => {
    const past = entries.map((x) => x.cmd).reverse();
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); setEntries([]); }
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

  const copy = (x) => navigator.clipboard?.writeText(stripAnsi(`${x.stdout || ''}${x.stderr || ''}`)).catch(() => {});

  return (
    <div className="dk-exec">
      <div className="dk-toolbar dk-toolbar--quiet">
        <span className="dk-muted">sh in <strong className="dk-ink">{container.name}</strong></span>
        <span className="dk-chip dk-num" title="Terminal size sent as COLUMNS × LINES; follows the window">{size.cols || '—'}×{size.rows || '—'}</span>
        <span className="dk-spacer" />
        <IconButton icon={<DIcon.Broom size={12} />} label="Clear (Ctrl+L)" onClick={() => setEntries([])} disabled={!entries.length} />
      </div>
      <div className="dk-execbox" ref={box} onMouseUp={() => { if (!window.getSelection?.()?.toString()) input.current?.focus(); }}>
        <span className="dk-probe" ref={probe} aria-hidden="true">MMMMMMMMMM</span>
        {entries.length === 0 && (
          <div className="dk-exec-intro">
            Each command runs with <code>sh -c</code> inside <strong>{container.name}</strong>, with colours on and the size of this pane. Try one:
            <div className="dk-quick">
              {QUICK.map((q) => <button key={q} type="button" className="dk-chip dk-chip--btn" onClick={() => submit(q)}>{q}</button>)}
            </div>
          </div>
        )}
        {entries.map((x, i) => (
          <div key={i} className="dk-exec-entry">
            <div className="dk-exec-cmd">
              <span className="dk-prompt">$</span><span className="dk-truncate">{x.cmd}</span>
              <span className="dk-exec-meta">
                {x.durationMs != null && <span className="dk-muted dk-num">{x.durationMs < 1000 ? `${x.durationMs}ms` : `${(x.durationMs / 1000).toFixed(1)}s`}</span>}
                {(x.stdout || x.stderr) && <button type="button" className="dk-linkbtn" onClick={() => copy(x)}>Copy</button>}
                <span className={`dk-exit ${x.ok ? 'is-ok' : 'is-err'}`}>{x.ok ? 'exit 0' : `exit ${x.exitCode ?? '?'}`}</span>
              </span>
            </div>
            {x.stdout && <pre className="dk-exec-out"><AnsiText text={x.stdout} /></pre>}
            {x.stderr && <pre className="dk-exec-out is-err"><AnsiText text={x.stderr} /></pre>}
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

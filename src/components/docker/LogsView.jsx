import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVisibilityAwareInterval } from '../../lib/usePolling.js';
import { DIcon } from './dockerIcons.jsx';
import { IconButton, EmptyState, SkeletonRows } from './DockerUi.jsx';
import { AnsiText, stripAnsi } from './ansi.jsx';
import { dockerApi, shortTime, logLevel } from './dockerApi.js';

const TAILS = [100, 300, 1000];
const LEVELS = [
  { id: 'all', label: 'All' },
  { id: 'error', label: 'Errors' },
  { id: 'warn', label: 'Warnings' },
  { id: 'info', label: 'Info' },
  { id: 'debug', label: 'Debug' },
];

const keyOf = (l) => `${l.ts}\u0000${l.stream}\u0000${l.text}`;

/**
 * Container logs that follow live. Pausing freezes what you are reading
 * while new lines keep arriving underneath and are counted, so nothing is
 * lost; Resume jumps to the end. Level chips and the text filter narrow
 * what is shown, with matches marked.
 */
export function LogsView({ container }) {
  const [latest, setLatest] = useState(null);
  const [frozen, setFrozen] = useState(null);
  const [error, setError] = useState(null);
  const [follow, setFollow] = useState(true);
  const [pinned, setPinned] = useState(true);
  const [showTime, setShowTime] = useState(true);
  const [wrap, setWrap] = useState(true);
  const [tail, setTail] = useState(300);
  const [level, setLevel] = useState('all');
  const [filter, setFilter] = useState('');
  const scroller = useRef(null);
  const running = container.state === 'running';

  const load = useCallback(async () => {
    try {
      const rows = await dockerApi.logs(container.id, tail);
      setLatest(rows.map((l) => ({ ...l, level: logLevel(l) })));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [container.id, tail]);

  useEffect(() => { setLatest(null); setFrozen(null); load(); }, [load]);
  useVisibilityAwareInterval(load, running ? 2000 : null);

  const lines = follow ? latest : frozen;
  const newCount = useMemo(() => {
    if (follow || !frozen || !latest) return 0;
    const seen = new Set(frozen.map(keyOf));
    return latest.filter((l) => !seen.has(keyOf(l))).length;
  }, [follow, frozen, latest]);

  const counts = useMemo(() => {
    const c = { all: 0, error: 0, warn: 0, info: 0, debug: 0 };
    for (const l of lines || []) { c.all += 1; c[l.level] += 1; }
    return c;
  }, [lines]);

  const visible = useMemo(() => {
    if (!lines) return [];
    const q = filter.toLowerCase();
    return lines.filter((l) => (level === 'all' || l.level === level) && (!q || stripAnsi(l.text).toLowerCase().includes(q)));
  }, [lines, filter, level]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && follow && pinned) el.scrollTop = el.scrollHeight;
  }, [visible, follow, pinned]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
  };

  const pause = () => { setFrozen(latest); setFollow(false); };
  const resume = () => { setFollow(true); setPinned(true); };
  const toggleFollow = () => (follow ? pause() : resume());

  const download = () => {
    const text = (lines || []).map((l) => `${l.ts} ${l.stream === 'stderr' ? '[err] ' : ''}${stripAnsi(l.text)}`).join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${container.name}.log` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const live = follow && running;
  return (
    <div className="dk-logs">
      <div className="dk-toolbar">
        <button type="button" className={`dk-toggle ${live ? 'is-on' : ''}`} onClick={toggleFollow} aria-pressed={follow}
          title={follow ? 'Pause to read without new lines moving the view' : 'Resume following new lines'}>
          {follow ? <><span className={`dk-dot ${live ? 'dk-dot--ok dk-dot--pulse' : 'dk-dot--idle'}`} />Live</> : <><DIcon.Pause size={11} />Paused</>}
        </button>
        <label className="dk-search dk-search--sm">
          <DIcon.Search size={12} />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter lines" aria-label="Filter log lines" />
          {filter && <button type="button" className="dk-search-x" onClick={() => setFilter('')} aria-label="Clear filter"><DIcon.Close size={11} /></button>}
        </label>
        <button type="button" className={`dk-toggle ${showTime ? 'is-on' : ''}`} onClick={() => setShowTime((s) => !s)} aria-pressed={showTime}>Time</button>
        <button type="button" className={`dk-toggle ${wrap ? 'is-on' : ''}`} onClick={() => setWrap((w) => !w)} aria-pressed={wrap}>Wrap</button>
        <select className="dk-select" value={tail} onChange={(e) => setTail(Number(e.target.value))} aria-label="Lines to load">
          {TAILS.map((t) => <option key={t} value={t}>Last {t}</option>)}
        </select>
        <IconButton icon={<DIcon.Download />} label="Download log" onClick={download} disabled={!lines?.length} />
      </div>
      {lines?.length > 0 && (
        <div className="dk-levels" role="tablist" aria-label="Log level">
          {LEVELS.filter((l) => l.id === 'all' || counts[l.id] > 0).map((l) => (
            <button key={l.id} type="button" role="tab" aria-selected={level === l.id}
              className={`dk-filter dk-filter--sm dk-lvl-chip--${l.id} ${level === l.id ? 'is-active' : ''}`} onClick={() => setLevel(l.id)}>
              {l.id !== 'all' && <span className={`dk-lvl-dot dk-lvl-dot--${l.id}`} />}{l.label}<span className="dk-count">{counts[l.id]}</span>
            </button>
          ))}
          {(filter || level !== 'all') && <span className="dk-muted dk-levels-meta">{visible.length} of {lines.length} lines</span>}
        </div>
      )}
      {error && <div className="dk-inline-error">{error}</div>}
      {lines === null && !error ? <SkeletonRows count={4} /> : lines?.length === 0 ? (
        <EmptyState icon={<DIcon.Logs size={26} />} title="No log output yet">
          <p>{running ? 'New lines appear here live.' : 'This container hasn\'t written anything to stdout or stderr.'}</p>
        </EmptyState>
      ) : (
        <div className="dk-logwrap">
          <div className={`dk-logbox ${wrap ? '' : 'is-nowrap'}`} ref={scroller} onScroll={onScroll} role="log" aria-live={live ? 'polite' : 'off'}>
            {visible.map((l, i) => (
              <div key={`${l.ts}-${i}`} className={`dk-logline dk-lvl--${l.level} ${l.level === 'error' ? 'is-err' : ''}`}>
                {showTime && <span className="dk-logts" title={l.ts}>{shortTime(l.ts)}</span>}
                <span className="dk-logtext"><AnsiText text={l.text} query={filter} /></span>
              </div>
            ))}
            {(filter || level !== 'all') && visible.length === 0 && (
              <div className="dk-logline dk-muted">No lines match{filter ? ` “${filter}”` : ''}{level !== 'all' ? ` at ${level} level` : ''}.</div>
            )}
          </div>
          {!follow && (
            <button type="button" className="dk-jump" onClick={resume}>
              <DIcon.Down size={12} />{newCount > 0 ? `${newCount} new line${newCount === 1 ? '' : 's'} · Resume` : 'Resume live'}
            </button>
          )}
          {follow && !pinned && (
            <button type="button" className="dk-jump" onClick={() => { setPinned(true); const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; }}>
              <DIcon.Down size={12} />Jump to latest
            </button>
          )}
        </div>
      )}
    </div>
  );
}

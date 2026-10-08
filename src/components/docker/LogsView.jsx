import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVisibilityAwareInterval } from '../../lib/usePolling.js';
import { DIcon } from './dockerIcons.jsx';
import { IconButton, EmptyState, SkeletonRows } from './DockerUi.jsx';
import { dockerApi, shortTime } from './dockerApi.js';

const TAILS = [100, 300, 1000];

export function LogsView({ container }) {
  const [lines, setLines] = useState(null);
  const [error, setError] = useState(null);
  const [follow, setFollow] = useState(true);
  const [showTime, setShowTime] = useState(true);
  const [tail, setTail] = useState(300);
  const [filter, setFilter] = useState('');
  const scroller = useRef(null);
  const pinned = useRef(true);

  const load = useCallback(async () => {
    try {
      setLines(await dockerApi.logs(container.id, tail));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [container.id, tail]);

  useEffect(() => { setLines(null); load(); }, [load]);
  useVisibilityAwareInterval(load, follow && container.state === 'running' ? 2000 : null);

  const visible = useMemo(() => {
    if (!lines) return [];
    if (!filter) return lines;
    const q = filter.toLowerCase();
    return lines.filter((l) => l.text.toLowerCase().includes(q));
  }, [lines, filter]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && follow && pinned.current) el.scrollTop = el.scrollHeight;
  }, [visible, follow]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  const download = () => {
    const text = (lines || []).map((l) => `${l.ts} ${l.stream === 'stderr' ? '[err] ' : ''}${l.text}`).join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${container.name}.log` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="dk-logs">
      <div className="dk-toolbar">
        <label className="dk-search dk-search--sm">
          <DIcon.Search size={12} />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter lines" aria-label="Filter log lines" />
        </label>
        <button type="button" className={`dk-toggle ${follow ? 'is-on' : ''}`} onClick={() => { setFollow((f) => !f); pinned.current = true; }}
          aria-pressed={follow} title="Stream new lines as they arrive">
          <span className={`dk-dot ${follow && container.state === 'running' ? 'dk-dot--ok dk-dot--pulse' : 'dk-dot--idle'}`} />Live
        </button>
        <button type="button" className={`dk-toggle ${showTime ? 'is-on' : ''}`} onClick={() => setShowTime((s) => !s)} aria-pressed={showTime}>Time</button>
        <select className="dk-select" value={tail} onChange={(e) => setTail(Number(e.target.value))} aria-label="Lines to load">
          {TAILS.map((t) => <option key={t} value={t}>Last {t}</option>)}
        </select>
        <IconButton icon={<DIcon.Download />} label="Download log" onClick={download} disabled={!lines?.length} />
      </div>
      {error && <div className="dk-inline-error">{error}</div>}
      {lines === null && !error ? <SkeletonRows count={4} /> : lines?.length === 0 ? (
        <EmptyState icon={<DIcon.Logs size={26} />} title="No log output yet">
          <p>{container.state === 'running' ? 'New lines appear here live.' : 'This container hasn\'t written anything to stdout or stderr.'}</p>
        </EmptyState>
      ) : (
        <div className="dk-logbox" ref={scroller} onScroll={onScroll} role="log" aria-live={follow ? 'polite' : 'off'}>
          {visible.map((l, i) => (
            <div key={`${l.ts}-${i}`} className={`dk-logline ${l.stream === 'stderr' ? 'is-err' : ''}`}>
              {showTime && <span className="dk-logts">{shortTime(l.ts)}</span>}
              <span className="dk-logtext">{l.text}</span>
            </div>
          ))}
          {filter && visible.length === 0 && <div className="dk-logline dk-muted">No lines match “{filter}”.</div>}
        </div>
      )}
    </div>
  );
}

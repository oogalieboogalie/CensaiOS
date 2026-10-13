import React, { useEffect, useMemo, useState } from 'react';
import { DIcon } from './dockerIcons.jsx';
import { IconButton, StatusDot, Sparkline, Kbd } from './DockerUi.jsx';
import { formatBytes, formatPercent, isFailing } from './dockerApi.js';

// The Docker window's top engine bar (identity, live host load, counts) and
// bottom status bar (freshness + keyboard hints).

// Host load = the sum of every container's CPU, shown against all cores.
function hostSeries(history, cpus) {
  const byTime = new Map();
  for (const samples of Object.values(history)) {
    for (const s of samples) {
      const row = byTime.get(s.t) || { cpu: 0, mem: 0 };
      row.cpu += s.cpu || 0;
      row.mem += s.memUsed || 0;
      byTime.set(s.t, row);
    }
  }
  const rows = [...byTime.entries()].sort(([a], [b]) => a - b).map(([, r]) => r);
  return { cpu: rows.map((r) => r.cpu / Math.max(1, cpus || 1)), mem: rows.map((r) => r.mem) };
}

export function EngineBar({ status, containers, history, onRefresh, refreshing }) {
  const e = status.engine || {};
  const list = containers || [];
  const running = list.filter((c) => c.state === 'running').length;
  const failing = list.filter(isFailing).length;
  const disk = (status.disk || []).reduce((s, d) => s + d.size, 0);
  const reclaim = (status.disk || []).reduce((s, d) => s + d.reclaimable, 0);
  const host = useMemo(() => hostSeries(history, e.cpus), [history, e.cpus]);
  const cpuNow = host.cpu[host.cpu.length - 1];
  const memNow = host.mem[host.mem.length - 1];
  const metrics = [
    { label: 'Running', value: running, tone: running ? 'ok' : undefined },
    { label: 'Stopped', value: list.length - running },
    ...(failing ? [{ label: 'Attention', value: failing, tone: 'danger', title: 'Unhealthy, crashed or restarting' }] : []),
    { label: 'Images', value: status.counts?.images ?? '—' },
    { label: 'Disk', value: formatBytes(disk), title: reclaim ? `${formatBytes(reclaim)} reclaimable` : undefined },
  ];
  return (
    <div className="dk-engine">
      <div className="dk-engine-id">
        <span className="dk-engine-logo"><DIcon.Whale size={20} /></span>
        <div className="dk-row-text">
          <div className="dk-engine-name"><StatusDot tone="ok" /> Engine running</div>
          <div className="dk-row-sub dk-truncate">
            {e.name ? `${e.name} · ` : ''}v{e.version} · {e.os}{e.arch ? ` · ${e.arch}` : ''}{e.cpus ? ` · ${e.cpus} CPUs` : ''}{e.memTotal ? ` · ${formatBytes(e.memTotal)}` : ''}
          </div>
        </div>
      </div>
      {cpuNow != null && (
        <div className="dk-engine-load" title="Combined load of all running containers">
          <div className="dk-load">
            <span className="dk-load-label">CPU</span>
            <strong className="dk-num">{formatPercent(cpuNow)}</strong>
            <Sparkline points={host.cpu} max={Math.max(5, ...host.cpu)} height={22} className="dk-spark--load" />
          </div>
          <div className="dk-load">
            <span className="dk-load-label">MEM</span>
            <strong className="dk-num">{formatBytes(memNow)}</strong>
            <Sparkline points={host.mem} max={e.memTotal || Math.max(...host.mem)} height={22} className="dk-spark--load" />
          </div>
        </div>
      )}
      <div className="dk-engine-metrics">
        {metrics.map((m) => (
          <div key={m.label} className={`dk-metric ${m.tone ? `dk-metric--${m.tone}` : ''}`} title={m.title}>
            <strong>{m.value}</strong><span>{m.label}</span>
          </div>
        ))}
        <IconButton icon={<DIcon.Refresh />} label="Refresh now" onClick={onRefresh} busy={refreshing} />
      </div>
    </div>
  );
}

function ago(ts, now) {
  if (!ts) return 'connecting…';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  return s < 2 ? 'updated just now' : `updated ${s}s ago`;
}

export function StatusBar({ updatedAt, stale, detailOpen }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <footer className="dk-statusbar">
      <span className={`dk-live ${stale ? 'is-stale' : ''}`}>
        <StatusDot tone={stale ? 'warn' : 'ok'} pulse={!stale} />
        {stale ? 'Reconnecting to Docker…' : <>Live <span className="dk-muted">· {ago(updatedAt, now)}</span></>}
      </span>
      <span className="dk-keys" aria-hidden="true">
        <span><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
        <span><Kbd>↵</Kbd> open</span>
        {detailOpen && <span><Kbd>L</Kbd><Kbd>S</Kbd><Kbd>E</Kbd><Kbd>I</Kbd> panes</span>}
        <span><Kbd>Esc</Kbd> back</span>
        <span><Kbd>/</Kbd> search</span>
      </span>
    </footer>
  );
}

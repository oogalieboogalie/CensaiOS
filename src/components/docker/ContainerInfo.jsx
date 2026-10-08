import React, { useEffect, useState } from 'react';
import { DIcon } from './dockerIcons.jsx';
import { Sparkline, SkeletonRows, Badge } from './DockerUi.jsx';
import { dockerApi, formatBytes, formatPercent } from './dockerApi.js';

function Section({ title, count, children }) {
  return (
    <section className="dk-section">
      <h4 className="dk-section-title">{title}{count != null && <span className="dk-count">{count}</span>}</h4>
      {children}
    </section>
  );
}

function when(ts) {
  const d = new Date(ts);
  return !ts || ts.startsWith('0001') || Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

/** Inspect summary: facts, health checks, ports, mounts, networks, env. */
export function OverviewView({ container }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let live = true;
    dockerApi.inspect(container.id).then((d) => live && (setInfo(d), setError(null))).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [container.id, container.state]);

  if (error) return <div className="dk-inline-error">{error}</div>;
  if (!info) return <SkeletonRows count={4} />;
  const st = info.state;
  const facts = [
    ['Image', info.image],
    ['Command', info.command || '—'],
    ['Created', when(info.created)],
    [st.running ? 'Started' : 'Finished', when(st.running ? st.startedAt : st.finishedAt)],
    ['Restart policy', `${info.restartPolicy}${info.restartCount ? ` · ${info.restartCount} restarts` : ''}`],
    ...(!st.running ? [['Exit code', `${st.exitCode}${st.oomKilled ? ' · out of memory' : ''}`]] : [['PID', String(st.pid)]]),
    ...(info.workingDir ? [['Working dir', info.workingDir]] : []),
  ];
  return (
    <div className="dk-overview">
      {st.error && <div className="dk-inline-error">{st.error}</div>}
      <dl className="dk-facts">
        {facts.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd title={v}>{v}</dd></React.Fragment>)}
      </dl>
      {info.health && (
        <Section title="Health checks">
          <div className="dk-health-head">
            <Badge tone={info.health.status === 'healthy' ? 'ok' : info.health.status === 'unhealthy' ? 'danger' : 'warn'}>{info.health.status}</Badge>
            {info.health.failingStreak > 0 && <span className="dk-muted">{info.health.failingStreak} failing in a row</span>}
          </div>
          {info.health.log.map((l, i) => (
            <div key={i} className={`dk-health-log ${l.exitCode === 0 ? '' : 'is-err'}`}>
              <span className="dk-mono">{l.exitCode === 0 ? '✓' : '✕'}</span><span className="dk-truncate">{l.output || `exit ${l.exitCode}`}</span>
            </div>
          ))}
        </Section>
      )}
      <Section title="Ports" count={info.ports.length}>
        {info.ports.length === 0 ? <p className="dk-muted">No ports exposed.</p> : (
          <div className="dk-kv">{info.ports.map((p) => (
            <div key={p.target} className="dk-kv-row"><span className="dk-mono">{p.target}</span>
              <span className="dk-mono dk-muted">{p.published.length ? p.published.join(', ') : 'not published'}</span></div>
          ))}</div>
        )}
      </Section>
      <Section title="Mounts" count={info.mounts.length}>
        {info.mounts.length === 0 ? <p className="dk-muted">No volumes or bind mounts.</p> : (
          <div className="dk-kv">{info.mounts.map((m) => (
            <div key={m.destination} className="dk-kv-row">
              <span className="dk-mono">{m.destination}</span>
              <span className="dk-mono dk-muted dk-truncate" title={m.source}>{m.type === 'volume' ? m.name : m.source}</span>
              <Badge>{m.type}{m.rw ? '' : ' · ro'}</Badge>
            </div>
          ))}</div>
        )}
      </Section>
      <Section title="Networks" count={info.networks.length}>
        <div className="dk-kv">{info.networks.map((n) => (
          <div key={n.name} className="dk-kv-row"><span className="dk-mono">{n.name}</span><span className="dk-mono dk-muted">{n.ipAddress || 'no address'}</span></div>
        ))}</div>
      </Section>
      <Section title="Environment" count={info.env.length}>
        <div className="dk-kv dk-kv--env">{info.env.map((e) => (
          <div key={e.key} className="dk-kv-row"><span className="dk-mono">{e.key}</span>
            <span className={`dk-mono dk-truncate ${e.masked ? 'dk-muted' : ''}`} title={e.masked ? 'Hidden because it looks like a secret' : e.value}>{e.value}</span></div>
        ))}</div>
      </Section>
    </div>
  );
}

function StatCard({ label, value, detail, points, max, small }) {
  return (
    <div className="dk-statcard">
      <div className="dk-statcard-label">{label}</div>
      <div className={`dk-statcard-value ${small ? 'dk-statcard-value--sm' : ''}`}>{value}</div>
      {detail && <div className="dk-statcard-detail">{detail}</div>}
      {points && <Sparkline points={points} max={max} />}
    </div>
  );
}

export function StatsView({ container, stat, history = [] }) {
  if (container.state !== 'running') {
    return <div className="dk-empty"><div className="dk-empty-icon"><DIcon.Chart size={26} /></div><div className="dk-empty-title">No live stats</div><div className="dk-empty-body"><p>Stats appear while the container is running.</p></div></div>;
  }
  if (!stat) return <SkeletonRows count={3} />;
  return (
    <div className="dk-stats">
      <StatCard label="CPU" value={formatPercent(stat.cpu)} detail="of all host cores" points={history.map((h) => h.cpu)} max={5} />
      <StatCard label="Memory" value={formatBytes(stat.memUsed)} detail={`${formatPercent(stat.memPercent)} of ${formatBytes(stat.memLimit)}`} points={history.map((h) => h.mem)} max={5} />
      <StatCard label="Network" small value={<><DIcon.Down size={12} />{formatBytes(stat.netRx)}<span className="dk-muted">·</span><DIcon.Up size={12} />{formatBytes(stat.netTx)}</>} detail="received · sent" />
      <StatCard label="Disk I/O" small value={`${formatBytes(stat.blockRead)} / ${formatBytes(stat.blockWrite)}`} detail="read · written" />
      <StatCard label="Processes" value={stat.pids} detail="PIDs inside the container" />
    </div>
  );
}

import React from 'react';
import { DIcon } from './dockerIcons.jsx';
import { EmptyState, SkeletonRows, IconButton, ConfirmButton, StatusDot, useConfirm } from './DockerUi.jsx';
import { dockerApi, containerTone, stateLabel, uptimeLabel, formatPorts, formatPercent, formatBytes } from './dockerApi.js';

function ServiceRow({ s, stat, busy, run, onOpen }) {
  const tone = containerTone(s);
  const running = s.state === 'running';
  const key = (a) => `${s.id}:${a}`;
  const act = (a, done) => run(key(a), () => dockerApi.action(s.id, a), `${s.service || s.name} ${done}`);
  const ports = formatPorts(s.ports);
  return (
    <div className="dk-svc" role="row">
      <button type="button" className="dk-svc-name" onClick={() => onOpen(s.id)} title={`Open ${s.name}`}>
        <StatusDot tone={tone} pulse={tone === 'warn'} />
        <span className="dk-truncate">{s.service || s.name}</span>
      </button>
      <span className="dk-svc-state">
        <span className={`dk-state dk-state--${tone}`}>{stateLabel(s)}</span>
        <span className="dk-muted dk-num dk-truncate">{uptimeLabel(s)}</span>
      </span>
      <span className="dk-muted dk-truncate dk-svc-image" title={s.image}>{s.image}</span>
      <span className="dk-num dk-svc-load">{running && stat ? `${formatPercent(stat.cpu)} · ${formatBytes(stat.memUsed)}` : '—'}</span>
      <span className="dk-svc-ports">
        {ports.slice(0, 1).map((p) => <span key={p} className="dk-chip">{p}</span>)}
        {ports.length > 1 && <span className="dk-chip dk-chip--more" title={ports.join(', ')}>+{ports.length - 1}</span>}
      </span>
      <span className="dk-actions dk-svc-actions">
        <IconButton icon={<DIcon.Logs />} label="Logs" onClick={() => onOpen(s.id, 'logs')} />
        {running
          ? <IconButton icon={<DIcon.Restart />} label="Restart service" busy={busy[key('restart')]} onClick={() => act('restart', 'restarted')} />
          : <IconButton icon={<DIcon.Play />} label="Start service" tone="ok" busy={busy[key('start')]} onClick={() => act('start', 'started')} />}
      </span>
    </div>
  );
}

export function ComposePanel({ projects, stats = {}, error, busy, run, query, onOpenContainer }) {
  const confirm = useConfirm();
  if (error && !projects) return <div className="dk-inline-error">{error}</div>;
  if (!projects) return <SkeletonRows count={3} />;
  const q = (query || '').toLowerCase();
  const visible = projects.filter((p) => !q || p.name.toLowerCase().includes(q) || p.services.some((s) => (s.service || s.name).toLowerCase().includes(q)));
  if (projects.length === 0) {
    return (
      <EmptyState icon={<DIcon.Stack size={30} />} title="No compose projects">
        <p>Projects started with <code>docker compose up</code> show up here with their services.</p>
      </EmptyState>
    );
  }
  return (
    <div className="dk-panel dk-compose">
      {visible.length === 0 && <EmptyState icon={<DIcon.Search size={26} />} title="Nothing matches"><p>No projects or services match “{query}”.</p></EmptyState>}
      {visible.map((p) => {
        const k = (a) => `compose:${p.name}:${a}`;
        const act = (a, done) => run(k(a), () => dockerApi.composeAction(p.name, a), `${p.name} ${done}`);
        const allUp = p.total > 0 && p.running === p.total;
        const tone = p.running === 0 ? 'idle' : allUp && !p.services.some((s) => s.health === 'unhealthy') ? 'ok' : 'warn';
        const stop = async () => {
          if (await confirm({
            title: `Stop ${p.name}?`,
            body: `All ${p.running} running service${p.running === 1 ? '' : 's'} stop. Containers, networks and volumes stay, so Up brings it back as it was.`,
            confirmLabel: 'Stop project', tone: 'neutral',
          })) act('stop', 'stopped');
        };
        return (
          <section key={p.name} className="dk-card">
            <header className="dk-card-head">
              <StatusDot tone={tone} />
              <div className="dk-row-text">
                <div className="dk-row-name">{p.name}<span className={`dk-state dk-state--${tone} dk-card-count dk-num`}>{p.running}/{p.total} up</span></div>
                <div className="dk-row-sub">
                  {p.configFiles[0] ? <span className="dk-truncate dk-mono" title={p.configFiles.join('\n')}>{p.configFiles[0]}</span>
                    : <span>Compose file location unknown, so Up and Pull are off</span>}
                </div>
              </div>
              <div className="dk-actions dk-actions--always">
                {!allUp && <IconButton icon={<DIcon.Play />} tone="ok" label="Up" busy={busy[k('up')]} disabled={!p.configFiles.length} onClick={() => act('up', 'is up')}>Up</IconButton>}
                {p.running > 0 && <IconButton icon={<DIcon.Stop />} label="Stop" busy={busy[k('stop')]} onClick={stop}>Stop</IconButton>}
                <IconButton icon={<DIcon.Restart />} label="Restart" busy={busy[k('restart')]} onClick={() => act('restart', 'restarted')}>Restart</IconButton>
                <IconButton icon={<DIcon.Download />} label="Pull latest images" busy={busy[k('pull')]} disabled={!p.configFiles.length} onClick={() => act('pull', 'images pulled')} />
                <ConfirmButton icon={<DIcon.Trash />} label="Down" busy={busy[k('down')]}
                  ask={{
                    title: `Take ${p.name} down?`,
                    body: `Stops and removes all ${p.total} container${p.total === 1 ? '' : 's'} and the project's networks. Named volumes and images are kept, so data survives and Up recreates everything.`,
                    detail: p.configFiles[0],
                    confirmLabel: 'Down',
                  }}
                  onConfirm={() => act('down', 'is down')} />
              </div>
            </header>
            {p.services.length === 0 ? (
              <p className="dk-muted dk-card-empty">No containers. Bring it up to create them.</p>
            ) : (
              <div className="dk-svcs" role="grid" aria-label={`${p.name} services`}>
                {p.services.map((s) => (
                  <ServiceRow key={s.id} s={s} stat={stats[s.shortId]} busy={busy} run={run} onOpen={onOpenContainer} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

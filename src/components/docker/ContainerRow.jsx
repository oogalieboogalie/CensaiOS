import React from 'react';
import { DIcon } from './dockerIcons.jsx';
import { IconButton, ConfirmButton, StatusDot, Badge, Sparkline, useConfirm } from './DockerUi.jsx';
import { dockerApi, containerTone, stateLabel, formatPorts, formatPercent, formatBytes, uptimeLabel } from './dockerApi.js';

function MemCell({ stat }) {
  const pct = Math.max(0, Math.min(100, stat.memPercent || 0));
  const tone = pct >= 85 ? 'danger' : pct >= 60 ? 'warn' : 'ok';
  return (
    <span className="dk-cell-mem" title={`${formatBytes(stat.memUsed)} of ${formatBytes(stat.memLimit)} (${formatPercent(pct)})`}>
      <span className="dk-num">{formatBytes(stat.memUsed)}</span>
      <span className="dk-mini-track"><span className={`dk-mini-fill dk-meter-fill--${tone}`} style={{ width: `${Math.max(pct, 2)}%` }} /></span>
    </span>
  );
}

function CpuCell({ stat, points }) {
  const hot = stat.cpu >= 80;
  return (
    <span className={`dk-cell-cpu ${hot ? 'is-hot' : ''}`} title={`${formatPercent(stat.cpu)} CPU (100% = one core)`}>
      <Sparkline points={points} max={Math.max(10, ...points)} height={18} className="dk-spark--row" />
      <span className="dk-num">{formatPercent(stat.cpu)}</span>
    </span>
  );
}

export function ContainerActions({ c, busy, run, compact = false }) {
  const confirm = useConfirm();
  const key = (a) => `${c.id}:${a}`;
  const act = (action, done) => run(key(action), () => dockerApi.action(c.id, action), `${c.name} ${done}`);
  const running = c.state === 'running';
  const paused = c.state === 'paused';
  const stop = async () => {
    const ok = await confirm({
      title: `Stop ${c.name}?`,
      body: c.composeProject
        ? `It stops serving right away. The rest of ${c.composeProject} keeps running, and Start brings it back with the same settings.`
        : 'It stops serving right away. Its files and settings stay, and Start brings it back.',
      confirmLabel: 'Stop', tone: 'neutral',
    });
    if (ok) act('stop', 'stopped');
  };
  return (
    <div className="dk-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {running && <IconButton icon={<DIcon.Stop />} label="Stop" busy={busy[key('stop')]} onClick={stop} />}
      {running && !compact && <IconButton icon={<DIcon.Pause />} label="Pause" busy={busy[key('pause')]} onClick={() => act('pause', 'paused')} />}
      {paused && <IconButton icon={<DIcon.Play />} label="Resume" tone="ok" busy={busy[key('unpause')]} onClick={() => act('unpause', 'resumed')} />}
      {!running && !paused && <IconButton icon={<DIcon.Play />} label="Start" tone="ok" busy={busy[key('start')]} onClick={() => act('start', 'started')} />}
      <IconButton icon={<DIcon.Restart />} label="Restart" busy={busy[key('restart')]} onClick={() => act('restart', 'restarted')} />
      <ConfirmButton icon={<DIcon.Trash />} label="Remove" busy={busy[key('remove')]}
        ask={{
          title: `Remove ${c.name}?`,
          body: running
            ? 'It is running, so Docker stops it first. The container and anything written inside it (outside volumes) is deleted. Named volumes are kept.'
            : 'The container and anything written inside it (outside volumes) is deleted. Named volumes are kept.',
          detail: c.image,
          confirmLabel: running ? 'Stop and remove' : 'Remove',
        }}
        onConfirm={() => run(key('remove'), () => dockerApi.remove(c.id, { force: true }), `${c.name} removed`)} />
    </div>
  );
}

export function ContainerRow({ c, stat, history, selected, cursor, onSelect, onHover, busy, run }) {
  const tone = containerTone(c);
  const ports = formatPorts(c.ports);
  const running = c.state === 'running';
  return (
    <div role="row" tabIndex={-1} data-id={c.id}
      className={`dk-row dk-row--grid ${selected ? 'is-selected' : ''} ${cursor ? 'is-cursor' : ''} ${running ? '' : 'is-idle'}`}
      onClick={() => onSelect(c.id)} onMouseMove={onHover ? () => onHover(c.id) : undefined} aria-selected={selected}>
      <div className="dk-row-main" role="gridcell">
        <StatusDot tone={tone} pulse={tone === 'warn'} />
        <div className="dk-row-text">
          <div className="dk-row-name">
            <span className="dk-truncate">{c.composeService || c.name}</span>
            {c.sandbox && <Badge tone="accent" title={c.hostPath || 'Agent sandbox'}>sandbox</Badge>}
            {c.health && c.health !== 'healthy' && <Badge tone={tone}>{c.health === 'starting' ? 'starting' : c.health}</Badge>}
          </div>
          <div className="dk-row-sub"><span className="dk-truncate" title={c.image}>{c.image}</span></div>
        </div>
      </div>
      <div className="dk-cell-state" role="gridcell">
        <span className={`dk-state dk-state--${tone}`}>{stateLabel(c)}</span>
        <span className="dk-row-status dk-num" title={c.status}>{uptimeLabel(c)}</span>
      </div>
      <div role="gridcell" className="dk-cell">{running && stat ? <CpuCell stat={stat} points={(history || []).map((h) => h.cpu)} /> : <span className="dk-dash">—</span>}</div>
      <div role="gridcell" className="dk-cell">{running && stat ? <MemCell stat={stat} /> : <span className="dk-dash">—</span>}</div>
      <div className="dk-row-ports" role="gridcell">
        {ports.slice(0, 1).map((p) => <span key={p} className="dk-chip">{p}</span>)}
        {ports.length > 1 && <span className="dk-chip dk-chip--more" title={ports.join(', ')}>+{ports.length - 1}</span>}
      </div>
      <ContainerActions c={c} busy={busy} run={run} compact />
    </div>
  );
}

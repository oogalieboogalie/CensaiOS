import React from 'react';
import { DIcon } from './dockerIcons.jsx';
import { IconButton, ConfirmButton, StatusDot, Badge } from './DockerUi.jsx';
import { dockerApi, containerTone, stateLabel, formatPorts, formatPercent, formatBytes } from './dockerApi.js';

function MiniBar({ label, value, text }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  const tone = pct >= 85 ? 'danger' : pct >= 60 ? 'warn' : 'ok';
  return (
    <span className="dk-mini">
      <span className="dk-mini-label">{label}</span>
      <span className="dk-mini-track"><span className={`dk-mini-fill dk-meter-fill--${tone}`} style={{ width: `${Math.max(pct, 2)}%` }} /></span>
      <span className="dk-mini-text">{text}</span>
    </span>
  );
}

export function ContainerActions({ c, busy, run, compact = false }) {
  const key = (a) => `${c.id}:${a}`;
  const act = (action, done) => run(key(action), () => dockerApi.action(c.id, action), `${c.name} ${done}`);
  const running = c.state === 'running';
  const paused = c.state === 'paused';
  return (
    <div className="dk-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {running && <IconButton icon={<DIcon.Stop />} label="Stop" busy={busy[key('stop')]} onClick={() => act('stop', 'stopped')} />}
      {running && !compact && <IconButton icon={<DIcon.Pause />} label="Pause" busy={busy[key('pause')]} onClick={() => act('pause', 'paused')} />}
      {paused && <IconButton icon={<DIcon.Play />} label="Resume" tone="ok" busy={busy[key('unpause')]} onClick={() => act('unpause', 'resumed')} />}
      {!running && !paused && <IconButton icon={<DIcon.Play />} label="Start" tone="ok" busy={busy[key('start')]} onClick={() => act('start', 'started')} />}
      <IconButton icon={<DIcon.Restart />} label="Restart" busy={busy[key('restart')]} onClick={() => act('restart', 'restarted')} />
      <ConfirmButton icon={<DIcon.Trash />} label="Remove" confirmLabel={running ? 'Force remove?' : 'Remove?'}
        busy={busy[key('remove')]}
        onConfirm={() => run(key('remove'), () => dockerApi.remove(c.id, { force: true }), `${c.name} removed`)} />
    </div>
  );
}

export function ContainerRow({ c, stat, selected, onSelect, busy, run }) {
  const tone = containerTone(c);
  const ports = formatPorts(c.ports);
  const running = c.state === 'running';
  return (
    <div role="button" tabIndex={0} className={`dk-row ${selected ? 'is-selected' : ''} ${running ? '' : 'is-idle'}`}
      onClick={() => onSelect(c.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(c.id); } }}
      aria-pressed={selected}>
      <div className="dk-row-main">
        <StatusDot tone={tone} pulse={tone === 'warn'} />
        <div className="dk-row-text">
          <div className="dk-row-name">
            <span className="dk-truncate">{c.composeService || c.name}</span>
            {c.sandbox && <Badge tone="accent" title={c.hostPath || 'Agent sandbox'}>sandbox</Badge>}
            {c.health && <Badge tone={tone}>{c.health === 'starting' ? 'health: starting' : c.health}</Badge>}
          </div>
          <div className="dk-row-sub">
            <span className={`dk-state dk-state--${tone}`}>{stateLabel(c)}</span>
            <span className="dk-sep">·</span>
            <span className="dk-truncate" title={c.image}>{c.image}</span>
          </div>
        </div>
      </div>
      <div className="dk-row-stats">
        {running && stat ? (
          <>
            <MiniBar label="CPU" value={stat.cpu} text={formatPercent(stat.cpu)} />
            <MiniBar label="MEM" value={stat.memPercent} text={formatBytes(stat.memUsed)} />
          </>
        ) : <span className="dk-row-status" title={c.status}>{running ? '—' : c.status}</span>}
      </div>
      <div className="dk-row-ports">
        {ports.slice(0, 2).map((p) => <span key={p} className="dk-chip">{p}</span>)}
        {ports.length > 2 && <span className="dk-chip dk-chip--more" title={ports.join(', ')}>+{ports.length - 2}</span>}
      </div>
      <ContainerActions c={c} busy={busy} run={run} compact />
    </div>
  );
}

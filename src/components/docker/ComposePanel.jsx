import React from 'react';
import { DIcon } from './dockerIcons.jsx';
import { EmptyState, SkeletonRows, IconButton, ConfirmButton, StatusDot } from './DockerUi.jsx';
import { dockerApi, containerTone } from './dockerApi.js';

export function ComposePanel({ projects, error, busy, run, query, onSelectContainer }) {
  if (error && !projects) return <div className="dk-inline-error">{error}</div>;
  if (!projects) return <SkeletonRows count={3} />;
  const visible = projects.filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()));
  if (projects.length === 0) {
    return (
      <EmptyState icon={<DIcon.Stack size={30} />} title="No compose projects">
        <p>Projects started with <code>docker compose up</code> show up here with their services.</p>
      </EmptyState>
    );
  }
  return (
    <div className="dk-panel dk-compose">
      {visible.map((p) => {
        const k = (a) => `compose:${p.name}:${a}`;
        const act = (a, done) => run(k(a), () => dockerApi.composeAction(p.name, a), `${p.name} ${done}`);
        const allUp = p.total > 0 && p.running === p.total;
        const tone = p.running === 0 ? 'idle' : allUp ? 'ok' : 'warn';
        return (
          <section key={p.name} className="dk-card">
            <header className="dk-card-head">
              <StatusDot tone={tone} />
              <div className="dk-row-text">
                <div className="dk-row-name">{p.name}</div>
                <div className="dk-row-sub">
                  <span>{p.running}/{p.total} services running</span>
                  {p.configFiles[0] && <><span className="dk-sep">·</span><span className="dk-truncate dk-mono" title={p.configFiles.join('\n')}>{p.configFiles[0]}</span></>}
                </div>
              </div>
              <div className="dk-actions dk-actions--always">
                {!allUp && <IconButton icon={<DIcon.Play />} tone="ok" label="Up" busy={busy[k('up')]} disabled={!p.configFiles.length} onClick={() => act('up', 'is up')}>Up</IconButton>}
                {p.running > 0 && <IconButton icon={<DIcon.Stop />} label="Stop" busy={busy[k('stop')]} onClick={() => act('stop', 'stopped')}>Stop</IconButton>}
                <IconButton icon={<DIcon.Restart />} label="Restart" busy={busy[k('restart')]} onClick={() => act('restart', 'restarted')} />
                <ConfirmButton icon={<DIcon.Trash />} label="Down (remove containers)" confirmLabel="Down?" busy={busy[k('down')]} onConfirm={() => act('down', 'is down')} />
              </div>
            </header>
            <div className="dk-services">
              {p.services.map((s) => (
                <button key={s.id} type="button" className="dk-service" onClick={() => onSelectContainer(s.id)} title={s.name}>
                  <StatusDot tone={containerTone(s)} /><span className="dk-truncate">{s.service || s.name}</span>
                  <DIcon.Chevron size={11} className="dk-service-go" />
                </button>
              ))}
              {p.services.length === 0 && <span className="dk-muted">No containers. Bring it up to create them.</span>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

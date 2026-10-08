import React, { useMemo, useState } from 'react';
import { DIcon } from './dockerIcons.jsx';
import { EmptyState, SkeletonRows, IconButton } from './DockerUi.jsx';
import { ContainerRow } from './ContainerRow.jsx';
import { dockerApi } from './dockerApi.js';

const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'running', label: 'Running', test: (c) => c.state === 'running' },
  { id: 'stopped', label: 'Stopped', test: (c) => c.state !== 'running' },
  { id: 'unhealthy', label: 'Unhealthy', test: (c) => c.health === 'unhealthy' || (c.state === 'exited' && /Exited \((?!0\))/.test(c.status)) },
];

function matches(c, q) {
  if (!q) return true;
  const hay = `${c.name} ${c.image} ${c.composeProject || ''} ${c.ports.join(' ')} ${c.shortId}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

export function ContainersPanel({ containers, stats, busy, run, selectedId, onSelect, query }) {
  const [filter, setFilter] = useState('all');
  const list = containers || [];
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, list.filter(f.test).length])), [list]);
  const groups = useMemo(() => {
    const test = FILTERS.find((f) => f.id === filter)?.test || (() => true);
    const visible = list.filter((c) => test(c) && matches(c, query));
    const map = new Map();
    for (const c of visible) {
      const k = c.composeProject || '';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(c);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
      .map(([project, items]) => ({
        project,
        items: items.sort((a, b) => (a.state === 'running') === (b.state === 'running') ? a.name.localeCompare(b.name) : a.state === 'running' ? -1 : 1),
      }));
  }, [list, filter, query]);

  if (containers === null) return <SkeletonRows count={6} />;
  if (list.length === 0) {
    return (
      <EmptyState icon={<DIcon.Box size={30} />} title="No containers yet">
        <p>Run one with <code>docker run</code> or bring up a compose project and it shows up here within a few seconds.</p>
      </EmptyState>
    );
  }

  return (
    <div className="dk-panel">
      <div className="dk-filterbar" role="tablist" aria-label="Filter containers">
        {FILTERS.filter((f) => f.id !== 'unhealthy' || counts.unhealthy > 0).map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filter === f.id}
            className={`dk-filter ${filter === f.id ? 'is-active' : ''} ${f.id === 'unhealthy' ? 'dk-filter--danger' : ''}`}
            onClick={() => setFilter(f.id)}>
            {f.label}<span className="dk-count">{counts[f.id]}</span>
          </button>
        ))}
      </div>
      {groups.length === 0 && (
        <EmptyState icon={<DIcon.Search size={26} />} title="Nothing matches">
          <p>No containers match {query ? <>“{query}”</> : 'this filter'}.</p>
        </EmptyState>
      )}
      {groups.map(({ project, items }) => {
        const up = items.filter((c) => c.state === 'running').length;
        return (
          <section key={project || '_standalone'} className="dk-group">
            <header className="dk-group-head">
              {project ? <DIcon.Stack size={13} /> : <DIcon.Box size={13} />}
              <span className="dk-group-name">{project || 'Standalone'}</span>
              <span className="dk-group-meta">{up}/{items.length} running</span>
              {project && (
                <div className="dk-group-actions">
                  <IconButton icon={<DIcon.Restart size={12} />} label={`Restart ${project}`} busy={busy[`compose:${project}:restart`]}
                    onClick={() => run(`compose:${project}:restart`, () => dockerApi.composeAction(project, 'restart'), `${project} restarted`)} />
                </div>
              )}
            </header>
            <div className="dk-rows">
              {items.map((c) => (
                <ContainerRow key={c.id} c={c} stat={stats[c.shortId]} selected={selectedId === c.id} onSelect={onSelect} busy={busy} run={run} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

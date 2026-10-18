import React, { useEffect, useMemo, useRef } from 'react';
import { DIcon } from './dockerIcons.jsx';
import { EmptyState, SkeletonRows, IconButton } from './DockerUi.jsx';
import { ContainerRow } from './ContainerRow.jsx';
import { dockerApi, isFailing } from './dockerApi.js';

export const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'running', label: 'Running', test: (c) => c.state === 'running' },
  { id: 'stopped', label: 'Stopped', test: (c) => c.state !== 'running' },
  { id: 'failing', label: 'Needs attention', test: isFailing },
];

function matches(c, q) {
  if (!q) return true;
  const hay = `${c.name} ${c.image} ${c.composeProject || ''} ${c.ports.join(' ')} ${c.shortId}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

/** Visible containers grouped by compose project, in display order. */
export function groupContainers(list, filter, query) {
  const test = FILTERS.find((f) => f.id === filter)?.test || (() => true);
  const map = new Map();
  for (const c of list) {
    if (!test(c) || !matches(c, query)) continue;
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
}

export function ContainersPanel({ containers, stats, history, busy, run, selectedId, cursorId, onSelect, query, filter, onFilter }) {
  const list = containers || [];
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, list.filter(f.test).length])), [list]);
  const groups = useMemo(() => groupContainers(list, filter, query), [list, filter, query]);
  const root = useRef(null);

  // Keep the keyboard cursor in view as it moves.
  useEffect(() => {
    if (!cursorId) return;
    const el = root.current?.querySelector(`[data-id="${cursorId}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [cursorId]);

  if (containers === null) return <SkeletonRows count={6} />;
  if (list.length === 0) {
    return (
      <EmptyState icon={<DIcon.Box size={30} />} title="No containers yet">
        <p>Start one from the Images tab with its Run button, or bring up a compose project, and it shows up here within a few seconds.</p>
      </EmptyState>
    );
  }

  return (
    <div className="dk-panel" ref={root}>
      <div className="dk-filterbar" role="tablist" aria-label="Filter containers">
        {FILTERS.filter((f) => f.id !== 'failing' || counts.failing > 0).map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filter === f.id}
            className={`dk-filter ${filter === f.id ? 'is-active' : ''} ${f.id === 'failing' ? 'dk-filter--danger' : ''}`}
            onClick={() => onFilter(f.id)}>
            {f.label}<span className="dk-count">{counts[f.id]}</span>
          </button>
        ))}
      </div>
      {groups.length === 0 ? (
        <EmptyState icon={<DIcon.Search size={26} />} title="Nothing matches">
          <p>No containers match {query ? <>“{query}”</> : 'this filter'}. Press <kbd className="dk-kbd">Esc</kbd> to clear.</p>
        </EmptyState>
      ) : (
        <div className="dk-grid" role="grid" aria-label="Containers" aria-rowcount={groups.reduce((n, g) => n + g.items.length, 0)}>
          <div className="dk-row dk-row--grid dk-colhead" role="row">
            <span role="columnheader">Name</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">CPU</span>
            <span role="columnheader">Memory</span>
            <span role="columnheader" className="dk-colhead-ports">Ports</span>
            <span role="columnheader" aria-label="Actions" />
          </div>
          {groups.map(({ project, items }) => {
            const up = items.filter((c) => c.state === 'running').length;
            return (
              <section key={project || '_standalone'} className="dk-group" role="rowgroup">
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
                    <ContainerRow key={c.id} c={c} stat={stats[c.shortId]} history={history[c.shortId]}
                      selected={selectedId === c.id} cursor={cursorId === c.id} onSelect={onSelect} busy={busy} run={run} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

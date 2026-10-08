import React, { useState } from 'react';
import { DIcon } from './dockerIcons.jsx';
import { EmptyState, SkeletonRows, ConfirmButton, IconButton, Badge } from './DockerUi.jsx';
import { dockerApi, formatBytes } from './dockerApi.js';

// Images, volumes and networks share one table layout; each kind supplies
// how to name a row, what to show beside it and how to remove it.
const KINDS = {
  images: {
    icon: DIcon.Layers, noun: 'image', empty: 'No images pulled yet',
    key: (r) => r.id + r.ref,
    title: (r) => (r.dangling ? <span className="dk-muted">&lt;untagged&gt;</span> : <>{r.repository}<span className="dk-tag">:{r.tag}</span></>),
    sub: (r) => `${r.id.replace(/^sha256:/, '').slice(0, 12)} · ${r.createdSince}`,
    aside: (r) => formatBytes(r.size),
    removeRef: (r) => (r.dangling ? r.id : r.ref),
    remove: (r) => dockerApi.removeImage(r.dangling ? r.id : r.ref, false),
    prune: { target: 'images', label: 'Remove untagged images' },
  },
  volumes: {
    icon: DIcon.Disk, noun: 'volume', empty: 'No volumes',
    key: (r) => r.name,
    title: (r) => <span className="dk-truncate" title={r.name}>{r.name}</span>,
    sub: (r) => [r.driver, r.composeProject].filter(Boolean).join(' · '),
    aside: () => null,
    removeRef: (r) => r.name,
    remove: (r) => dockerApi.removeVolume(r.name),
    prune: { target: 'volumes', label: 'Remove unused volumes' },
  },
  networks: {
    icon: DIcon.Network, noun: 'network', empty: 'No networks',
    key: (r) => r.id,
    title: (r) => r.name,
    sub: (r) => [r.driver, r.scope, r.internal && 'internal', r.composeProject].filter(Boolean).join(' · '),
    aside: () => null,
    removeRef: (r) => r.name,
    remove: (r) => dockerApi.removeNetwork(r.name),
    canRemove: (r) => !r.builtin,
    prune: { target: 'networks', label: 'Remove unused networks' },
  },
};

function PullBar({ run, busy }) {
  const [ref, setRef] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const value = ref.trim();
    if (!value) return;
    const ok = await run('pull', () => dockerApi.pullImage(value), `Pulled ${value}`);
    if (ok) setRef('');
  };
  return (
    <form className="dk-pull" onSubmit={submit}>
      <label className="dk-search dk-search--sm">
        <DIcon.Download size={12} />
        <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Pull an image, e.g. nginx:alpine" aria-label="Image to pull" disabled={busy.pull} />
      </label>
      <button type="submit" className="dk-btn dk-btn--primary" disabled={!ref.trim() || busy.pull}>
        {busy.pull ? <><span className="dk-spinner" /> Pulling…</> : 'Pull'}
      </button>
    </form>
  );
}

export function ResourcesPanel({ kind, rows, error, busy, run, query }) {
  const k = KINDS[kind];
  if (error && !rows) return <div className="dk-inline-error">{error}</div>;
  if (!rows) return <SkeletonRows count={5} />;
  const q = query.toLowerCase();
  const visible = rows.filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q));
  const unused = rows.filter((r) => r.inUseBy.length === 0 && (k.canRemove ? k.canRemove(r) : true)).length;
  const total = kind === 'images' ? rows.reduce((s, r) => s + r.size, 0) : null;

  return (
    <div className="dk-panel">
      <div className="dk-filterbar dk-filterbar--split">
        <span className="dk-muted">
          {rows.length} {k.noun}{rows.length === 1 ? '' : 's'}{total != null && ` · ${formatBytes(total)}`}{unused > 0 && ` · ${unused} unused`}
        </span>
        <ConfirmButton icon={<DIcon.Broom size={12} />} label={k.prune.label} confirmLabel="Prune now?" busy={busy[`prune:${k.prune.target}`]}
          onConfirm={() => run(`prune:${k.prune.target}`, () => dockerApi.prune(k.prune.target), (r) => `Pruned ${k.prune.target} · freed ${r.reclaimed}`)}>
          Prune
        </ConfirmButton>
      </div>
      {kind === 'images' && <PullBar run={run} busy={busy} />}
      {rows.length === 0 && <EmptyState icon={<k.icon size={28} />} title={k.empty} />}
      {rows.length > 0 && visible.length === 0 && <EmptyState icon={<DIcon.Search size={26} />} title="Nothing matches"><p>No {k.noun}s match “{query}”.</p></EmptyState>}
      <div className="dk-rows">
        {visible.map((r) => {
          const inUse = r.inUseBy.length > 0;
          const removable = k.canRemove ? k.canRemove(r) : true;
          const busyKey = `rm:${kind}:${k.removeRef(r)}`;
          return (
            <div key={k.key(r)} className={`dk-row dk-row--static ${inUse ? '' : 'is-idle'}`}>
              <div className="dk-row-main">
                <span className="dk-row-icon"><k.icon size={14} /></span>
                <div className="dk-row-text">
                  <div className="dk-row-name">{k.title(r)}{r.builtin && <Badge>built-in</Badge>}</div>
                  <div className="dk-row-sub"><span className="dk-truncate">{k.sub(r)}</span></div>
                </div>
              </div>
              <div className="dk-row-stats">
                {inUse ? <Badge tone="ok" title={r.inUseBy.join(', ')}>in use · {r.inUseBy.length}</Badge> : <Badge>unused</Badge>}
              </div>
              <div className="dk-row-ports dk-mono">{k.aside(r)}</div>
              <div className="dk-actions">
                {removable ? (
                  <ConfirmButton icon={<DIcon.Trash />} label={`Remove ${k.noun}`} confirmLabel={inUse ? 'In use, try?' : 'Remove?'} busy={busy[busyKey]}
                    onConfirm={() => run(busyKey, () => k.remove(r), `Removed ${k.removeRef(r)}`)} />
                ) : <IconButton icon={<DIcon.Trash />} label="Built-in networks can't be removed" disabled />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { DIcon } from './docker/dockerIcons.jsx';
import { IconButton, StatusDot, UnavailableState, SkeletonRows, Toast } from './docker/DockerUi.jsx';
import { useDockerData } from './docker/useDockerData.js';
import { ContainersPanel } from './docker/ContainersPanel.jsx';
import { ContainerDetail } from './docker/ContainerDetail.jsx';
import { ComposePanel } from './docker/ComposePanel.jsx';
import { ResourcesPanel } from './docker/ResourcesPanel.jsx';
import { formatBytes } from './docker/dockerApi.js';
import './docker/docker.css';

const TABS = [
  { id: 'containers', label: 'Containers', icon: DIcon.Box },
  { id: 'compose', label: 'Compose', icon: DIcon.Stack },
  { id: 'images', label: 'Images', icon: DIcon.Layers },
  { id: 'volumes', label: 'Volumes', icon: DIcon.Disk },
  { id: 'networks', label: 'Networks', icon: DIcon.Network },
];

function EngineBar({ status, containers, onRefresh, refreshing }) {
  const e = status.engine || {};
  const list = containers || [];
  const running = list.filter((c) => c.state === 'running').length;
  const unhealthy = list.filter((c) => c.health === 'unhealthy').length;
  const disk = (status.disk || []).reduce((s, d) => s + d.size, 0);
  const reclaim = (status.disk || []).reduce((s, d) => s + d.reclaimable, 0);
  const metrics = [
    { label: 'Running', value: running, tone: running ? 'ok' : undefined },
    { label: 'Stopped', value: list.length - running },
    ...(unhealthy ? [{ label: 'Unhealthy', value: unhealthy, tone: 'danger' }] : []),
    { label: 'Images', value: status.counts?.images ?? '—' },
    { label: 'Disk', value: formatBytes(disk), title: reclaim ? `${formatBytes(reclaim)} reclaimable` : undefined },
  ];
  return (
    <div className="dk-engine">
      <div className="dk-engine-id">
        <span className="dk-engine-logo"><DIcon.Whale size={20} /></span>
        <div className="dk-row-text">
          <div className="dk-engine-name"><StatusDot tone="ok" pulse /> Engine running</div>
          <div className="dk-row-sub dk-truncate">
            v{e.version} · {e.os}{e.arch ? ` · ${e.arch}` : ''}{e.cpus ? ` · ${e.cpus} CPUs` : ''}{e.memTotal ? ` · ${formatBytes(e.memTotal)}` : ''}
          </div>
        </div>
      </div>
      <div className="dk-engine-metrics">
        {metrics.map((m) => (
          <div key={m.label} className={`dk-metric ${m.tone ? `dk-metric--${m.tone}` : ''}`} title={m.title}>
            <strong>{m.value}</strong><span>{m.label}</span>
          </div>
        ))}
        <IconButton icon={<DIcon.Refresh />} label="Refresh" onClick={onRefresh} busy={refreshing} />
      </div>
    </div>
  );
}

export function ContainersWindow({ win }) {
  const [tab, setTab] = useState('containers');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const data = useDockerData(tab);
  const { status, statusError, available, containers, resources } = data;
  const selected = useMemo(() => (containers || []).find((c) => c.id === selectedId) || null, [containers, selectedId]);
  useEffect(() => { if (containers && selectedId && !selected) setSelectedId(null); }, [containers, selectedId, selected]);

  const refresh = async () => { setRefreshing(true); await data.refresh(); setRefreshing(false); };
  const counts = {
    containers: containers?.length,
    compose: resources.compose?.length ?? new Set((containers || []).map((c) => c.composeProject).filter(Boolean)).size,
    images: resources.images?.length ?? status?.counts?.images,
    volumes: resources.volumes?.length,
    networks: resources.networks?.length,
  };
  const openContainer = (id) => { setTab('containers'); setQuery(''); setSelectedId(id); };

  let body;
  if (!status && !statusError) body = <SkeletonRows count={6} />;
  else if (statusError && !status) body = <UnavailableState reason={statusError.reason} message={statusError.message} onRetry={refresh} retrying={refreshing} />;
  else if (!available) body = <UnavailableState reason={status.reason} message={status.message} onRetry={refresh} retrying={refreshing} />;
  else {
    const common = { busy: data.busy, run: data.run, query };
    body = (
      <>
        <EngineBar status={status} containers={containers} onRefresh={refresh} refreshing={refreshing} />
        <div className="dk-tabbar">
          <nav className="dk-tabs" role="tablist" aria-label="Docker resources">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
                className={`dk-tab ${tab === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)}>
                <t.icon size={13} /><span className="dk-tab-label">{t.label}</span>
                {counts[t.id] != null && <span className="dk-count">{counts[t.id]}</span>}
              </button>
            ))}
          </nav>
          <label className="dk-search">
            <DIcon.Search size={13} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${tab}`} aria-label={`Search ${tab}`} />
            {query && <button type="button" className="dk-search-x" onClick={() => setQuery('')} aria-label="Clear search"><DIcon.Close size={11} /></button>}
          </label>
        </div>
        <div className={`dk-body ${tab === 'containers' && selected ? 'has-detail' : ''}`}>
          <div className="dk-list">
            {tab === 'containers' && <ContainersPanel {...common} containers={containers} stats={data.stats}
              selectedId={selectedId} onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))} />}
            {tab === 'compose' && <ComposePanel {...common} projects={resources.compose} error={data.resourceErrors.compose} onSelectContainer={openContainer} />}
            {['images', 'volumes', 'networks'].includes(tab) && (
              <ResourcesPanel {...common} kind={tab} rows={resources[tab]} error={data.resourceErrors[tab]} />
            )}
          </div>
          {tab === 'containers' && selected && (
            <ContainerDetail key={selected.id} container={selected} stat={data.stats[selected.shortId]}
              history={data.history[selected.shortId]} busy={data.busy} run={data.run} onClose={() => setSelectedId(null)} />
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <WindowTitle icon={<DIcon.Whale size={14} />} label={win.title || 'Docker'} />
      <div className="dk-root">
        {body}
        <Toast toast={data.toast} onDismiss={data.dismissToast} />
      </div>
    </>
  );
}

export default ContainersWindow;

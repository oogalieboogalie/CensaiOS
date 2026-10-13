import React, { useEffect, useMemo, useRef, useState } from 'react';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { DIcon } from './docker/dockerIcons.jsx';
import { UnavailableState, SkeletonRows, Toast, ConfirmProvider, Kbd } from './docker/DockerUi.jsx';
import { EngineBar, StatusBar } from './docker/EngineBar.jsx';
import { useDockerData } from './docker/useDockerData.js';
import { ContainersPanel, groupContainers } from './docker/ContainersPanel.jsx';
import { ContainerDetail, DETAIL_TABS } from './docker/ContainerDetail.jsx';
import { ComposePanel } from './docker/ComposePanel.jsx';
import { ResourcesPanel } from './docker/ResourcesPanel.jsx';
import './docker/docker.css';

const TABS = [
  { id: 'containers', label: 'Containers', icon: DIcon.Box },
  { id: 'compose', label: 'Compose', icon: DIcon.Stack },
  { id: 'images', label: 'Images', icon: DIcon.Layers },
  { id: 'volumes', label: 'Volumes', icon: DIcon.Disk },
  { id: 'networks', label: 'Networks', icon: DIcon.Network },
];

const typing = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

export function ContainersWindow({ win }) {
  const [tab, setTab] = useState('containers');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [cursorId, setCursorId] = useState(null);
  const [detailTab, setDetailTab] = useState('logs');
  const [refreshing, setRefreshing] = useState(false);
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const data = useDockerData(tab);
  const { status, statusError, available, containers, resources } = data;
  const selected = useMemo(() => (containers || []).find((c) => c.id === selectedId) || null, [containers, selectedId]);
  useEffect(() => { if (containers && selectedId && !selected) setSelectedId(null); }, [containers, selectedId, selected]);

  const ordered = useMemo(
    () => groupContainers(containers || [], filter, query).flatMap((g) => g.items.map((c) => c.id)),
    [containers, filter, query],
  );

  const refresh = async () => { setRefreshing(true); await data.refresh(); setRefreshing(false); };
  const counts = {
    containers: containers?.length,
    compose: resources.compose?.length ?? new Set((containers || []).map((c) => c.composeProject).filter(Boolean)).size,
    images: resources.images?.length ?? status?.counts?.images,
    volumes: resources.volumes?.length,
    networks: resources.networks?.length,
  };
  const openContainer = (id, pane) => {
    setTab('containers'); setQuery(''); setFilter('all'); setSelectedId(id); setCursorId(id);
    if (pane) setDetailTab(pane);
  };
  const select = (id) => { setCursorId(id); setSelectedId((cur) => (cur === id ? null : id)); };

  // Keyboard flow: arrows move, Enter opens, Esc steps back, / searches,
  // L/S/E/I switch the detail pane. Keys typed into fields stay there.
  const onKeyDown = (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const inField = typing(e.target);
    if (e.key === 'Escape') {
      if (inField) {
        if (e.target === searchRef.current && query) setQuery('');
        e.target.blur(); rootRef.current?.focus(); e.preventDefault();
        return;
      }
      if (selectedId) { setSelectedId(null); e.preventDefault(); return; }
      if (query || filter !== 'all') { setQuery(''); setFilter('all'); e.preventDefault(); }
      return;
    }
    if (inField) return;
    if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); return; }
    if (tab !== 'containers') return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'j' || e.key === 'k') {
      if (!ordered.length) return;
      e.preventDefault();
      const dir = e.key === 'ArrowDown' || e.key === 'j' ? 1 : -1;
      const at = ordered.indexOf(cursorId ?? selectedId);
      const next = ordered[at < 0 ? (dir > 0 ? 0 : ordered.length - 1) : Math.max(0, Math.min(ordered.length - 1, at + dir))];
      setCursorId(next);
      if (selectedId) setSelectedId(next); // with the pane open, it follows the cursor
      return;
    }
    if (e.key === 'Enter' && cursorId) { e.preventDefault(); setSelectedId(cursorId); return; }
    if (selectedId) {
      const pane = DETAIL_TABS.find((t) => t.key === e.key.toLowerCase());
      if (pane) { e.preventDefault(); setDetailTab(pane.id); }
    }
  };

  let body;
  if (!status && !statusError) body = <SkeletonRows count={6} />;
  else if (statusError && !status) body = <UnavailableState reason={statusError.reason} message={statusError.message} onRetry={refresh} retrying={refreshing} />;
  else if (!available) body = <UnavailableState reason={status.reason} message={status.message} onRetry={refresh} retrying={refreshing} />;
  else {
    const common = { busy: data.busy, run: data.run, query };
    body = (
      <>
        <EngineBar status={status} containers={containers} history={data.history} onRefresh={refresh} refreshing={refreshing} />
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
            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${tab}`} aria-label={`Search ${tab}`}
              onKeyDown={(e) => {
                // Enter in search opens the first match and hands keys back to the list.
                if (e.key === 'Enter' && tab === 'containers' && ordered.length) {
                  e.preventDefault(); setCursorId(ordered[0]); setSelectedId(ordered[0]); rootRef.current?.focus();
                }
              }} />
            {query ? <button type="button" className="dk-search-x" onClick={() => setQuery('')} aria-label="Clear search"><DIcon.Close size={11} /></button> : <Kbd>/</Kbd>}
          </label>
        </div>
        <div className={`dk-body ${tab === 'containers' && selected ? 'has-detail' : ''}`}>
          <div className="dk-list">
            {tab === 'containers' && <ContainersPanel {...common} containers={containers} stats={data.stats} history={data.history}
              filter={filter} onFilter={setFilter} selectedId={selectedId} cursorId={cursorId} onSelect={select} />}
            {tab === 'compose' && <ComposePanel {...common} projects={resources.compose} error={data.resourceErrors.compose}
              stats={data.stats} onOpenContainer={openContainer} />}
            {['images', 'volumes', 'networks'].includes(tab) && (
              <ResourcesPanel {...common} kind={tab} rows={resources[tab]} error={data.resourceErrors[tab]} />
            )}
          </div>
          {tab === 'containers' && selected && (
            <ContainerDetail key={selected.id} container={selected} stat={data.stats[selected.shortId]} tab={detailTab} onTab={setDetailTab}
              history={data.history[selected.shortId]} busy={data.busy} run={data.run} onClose={() => { setSelectedId(null); rootRef.current?.focus(); }} />
          )}
        </div>
        <StatusBar updatedAt={data.updatedAt} stale={data.stale} detailOpen={!!selected} />
      </>
    );
  }

  return (
    <>
      <WindowTitle icon={<DIcon.Whale size={14} />} label={win.title || 'Docker'} />
      <div className="dk-root" ref={rootRef} tabIndex={-1} onKeyDown={onKeyDown}
        onMouseDown={(e) => {
          // Clicking anywhere in the window gives it the keyboard.
          if (!e.target.closest('button,a,input,select,textarea,[tabindex]')) rootRef.current?.focus({ preventScroll: true });
        }}>
        <ConfirmProvider>
          {body}
          <Toast toast={data.toast} onDismiss={data.dismissToast} />
        </ConfirmProvider>
      </div>
    </>
  );
}

export default ContainersWindow;

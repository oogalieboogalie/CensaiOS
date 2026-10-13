import React from 'react';
import { DIcon } from './dockerIcons.jsx';
import { StatusDot, Badge } from './DockerUi.jsx';
import { ContainerActions } from './ContainerRow.jsx';
import { OverviewView, StatsView } from './ContainerInfo.jsx';
import { LogsView } from './LogsView.jsx';
import { ExecView } from './ExecView.jsx';
import { containerTone, stateLabel, uptimeLabel } from './dockerApi.js';

export const DETAIL_TABS = [
  { id: 'logs', label: 'Logs', icon: DIcon.Logs, key: 'l' },
  { id: 'stats', label: 'Stats', icon: DIcon.Chart, key: 's' },
  { id: 'exec', label: 'Exec', icon: DIcon.Prompt, key: 'e' },
  { id: 'info', label: 'Inspect', icon: DIcon.Info, key: 'i' },
];

export function ContainerDetail({ container, stat, history, busy, run, onClose, tab = 'logs', onTab }) {
  const setTab = onTab;
  const tone = containerTone(container);
  return (
    <aside className="dk-detail" aria-label={`${container.name} details`}>
      <header className="dk-detail-head">
        <div className="dk-detail-title">
          <StatusDot tone={tone} pulse={tone === 'warn'} />
          <div className="dk-row-text">
            <div className="dk-detail-name dk-truncate" title={container.name}>{container.name}</div>
            <div className="dk-row-sub">
              <span className={`dk-state dk-state--${tone}`}>{stateLabel(container)}</span>
              <span className="dk-num">{uptimeLabel(container)}</span>
              <span className="dk-sep">·</span><span className="dk-mono">{container.shortId}</span>
              {container.composeProject && <><span className="dk-sep">·</span><Badge>{container.composeProject}</Badge></>}
            </div>
          </div>
          <button type="button" className="dk-btn dk-btn--icon dk-detail-close" onClick={onClose} aria-label="Close details"><DIcon.Close /></button>
        </div>
        <ContainerActions c={container} busy={busy} run={run} />
        <nav className="dk-subtabs" role="tablist">
          {DETAIL_TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
              className={`dk-subtab ${tab === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)} title={`${t.label} (${t.key.toUpperCase()})`}>
              <t.icon size={12} />{t.label}
            </button>
          ))}
        </nav>
      </header>
      <div className="dk-detail-body">
        {tab === 'logs' && <LogsView container={container} />}
        {tab === 'stats' && <StatsView container={container} stat={stat} history={history} />}
        {tab === 'exec' && <ExecView key={container.id} container={container} />}
        {tab === 'info' && <OverviewView container={container} />}
      </div>
    </aside>
  );
}

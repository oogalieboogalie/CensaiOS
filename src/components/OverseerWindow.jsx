import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { useOverseer } from './overseer/useOverseer.js';
import { OverseerControls } from './overseer/OverseerControls.jsx';
import { OverseerStatus } from './overseer/OverseerStatus.jsx';
import { OverseerLogs } from './overseer/OverseerLogs.jsx';

export function OverseerWindow({ win }) {
  const {
    status,
    repos,
    selectedRepo,
    isCustomRepo,
    customRepoText,
    setCustomRepoText,
    autoMerge,
    setAutoMerge,
    error,
    logEndRef,
    handleStart,
    handleStop,
    handleRunNow,
    handleRepoChange
  } = useOverseer();

  return (
    <>
      <WindowTitle
        icon={<Icon.Tools size={14} />}
        label={win.title || 'Overseer Watcher'}
        subtitle={status.isRunning ? `Running hourly · ${status.autoMerge ? 'merges PRs' : 'merges nothing'}` : 'Stopped'}
      />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 14, gap: 12 }}>
        <OverseerControls 
          status={status} repos={repos} selectedRepo={selectedRepo} 
          isCustomRepo={isCustomRepo} customRepoText={customRepoText} 
          setCustomRepoText={setCustomRepoText} handleRepoChange={handleRepoChange} 
          handleStart={handleStart} handleStop={handleStop} handleRunNow={handleRunNow} 
        />

        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', display: 'grid', gap: 6, paddingLeft: 4 }}>
          <span>Every hour this runs the Jules queue on the repository: it hands the next task to Jules and checks Jules's pull requests.</span>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink)', cursor: status.isRunning || status.isAuditing ? 'not-allowed' : 'pointer' }}>
            <input type="checkbox" checked={autoMerge} disabled={status.isRunning || status.isAuditing} onChange={(e) => setAutoMerge(e.target.checked)} />
            Merge pull requests that pass their checks
          </label>
          <span style={{ fontSize: 'var(--text-xs)' }}>
            {autoMerge ? 'On: ready pull requests are merged into the repository with no one reviewing them.' : 'Off: nothing is merged. Ready pull requests wait for you.'}
            {status.isRunning ? ' Stop the watcher to change this.' : ''}
          </span>
        </div>

        <OverseerStatus status={status} />

        {error && <div style={{ color: 'var(--ps-red)', fontSize: 'var(--text-sm)', paddingLeft: 4 }}>{error}</div>}

        <OverseerLogs status={status} logEndRef={logEndRef} />
      </div>
      
      {/* Dynamic spinner stylesheet snippet */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}

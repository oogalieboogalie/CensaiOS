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
        subtitle={status.isRunning ? 'Active Daemon' : 'Stopped'}
      />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 14, gap: 12 }}>
        <OverseerControls 
          status={status} repos={repos} selectedRepo={selectedRepo} 
          isCustomRepo={isCustomRepo} customRepoText={customRepoText} 
          setCustomRepoText={setCustomRepoText} handleRepoChange={handleRepoChange} 
          handleStart={handleStart} handleStop={handleStop} handleRunNow={handleRunNow} 
        />

        <OverseerStatus status={status} />

        {error && <div style={{ color: 'var(--ps-red)', fontSize: 12, paddingLeft: 4 }}>{error}</div>}

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

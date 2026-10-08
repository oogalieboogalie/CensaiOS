import React from 'react';
import { Icon } from '../Icons.jsx';

export function OverseerControls({ 
  status, repos, selectedRepo, isCustomRepo, customRepoText, 
  setCustomRepoText, handleRepoChange, handleStart, handleStop, handleRunNow 
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 'var(--radius-xl)', border: '1px solid var(--hairline)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200, flex: 1 }}>
        <span style={{ fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', letterSpacing: 'var(--label-tracking)', textTransform: 'var(--label-case)' }}>Target Repository</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <select
            value={selectedRepo}
            onChange={handleRepoChange}
            disabled={status.isAuditing}
            style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', padding: '6px 8px', fontSize: 'var(--text-sm)', color: 'var(--ink)', outline: 'none' }}
          >
            {repos.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
            <option value="custom">Custom...</option>
          </select>
          {isCustomRepo && (
            <input
              type="text"
              placeholder="owner/repo"
              value={customRepoText}
              onChange={(e) => setCustomRepoText(e.target.value)}
              disabled={status.isAuditing}
              style={{ flex: 1.2, background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', padding: '6px 8px', fontSize: 'var(--text-sm)', color: 'var(--ink)', outline: 'none' }}
            />
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end', paddingTop: 4 }}>
        {status.isRunning ? (
          <button
            type="button"
            onClick={handleStop}
            style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--ps-red)', background: 'oklch(from var(--ps-red) l c h / 0.08)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ps-red)' }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ps-red)' }} />
            Stop Watcher
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStart}
            disabled={status.isAuditing}
            style={{ all: 'unset', cursor: status.isAuditing ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 'var(--radius-lg)', background: 'var(--accent)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'white' }}
          >
            <Icon.Plus size={12} />
            Start Watcher
          </button>
        )}

        <button
          type="button"
          onClick={handleRunNow}
          disabled={status.isAuditing}
          style={{ all: 'unset', cursor: status.isAuditing ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--hairline)', background: 'var(--surface)', fontSize: 'var(--text-sm)', color: 'var(--ink)' }}
        >
          <Icon.Bot size={13} />
          Run Now
        </button>
      </div>
    </div>
  );
}

import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { fmtTime, iconButtonStyle } from './operations/OperationsShared.jsx';
import { UnderTheHood } from './operations/UnderTheHood.jsx';
import { ColorSettingsPanel } from './ColorSettingsPanel.jsx';
import { LiveOpsView } from './liveOps/LiveOpsView.jsx';
import { useLiveOpsData } from './liveOps/useLiveOpsData.js';
import { buildFeed } from '../lib/liveOps/feed.js';
import { showWindow } from '../lib/agentNetwork/askBoardAgent.js';
import { useWorkspaceStore } from '../lib/store.js';

// Where "Open" goes for things that are not a window on the board.
const OPENS = { console: 'agentConsole', dev: 'devServer', schedule: 'scheduler', task: 'scheduler' };

/**
 * Live Operations: everything happening on the board at a glance, for
 * everyone on it. What is running, what needs a person, what failed and
 * why in plain words, what is coming up, and what it cost today. The
 * technical health view is one click away under "Under the hood".
 */
export function OperationsBoardWindow({ win, onUpdate, isActive }) {
  const spawnAt = useWorkspaceStore((s) => s.spawnAt);
  const workspaceId = useWorkspaceStore((s) => s.workspaceId);
  const wins = useWorkspaceStore((s) => s.wins);
  const [includeCompleted, setIncludeCompleted] = React.useState(false);
  const [hoodOpen, setHoodOpen] = React.useState(false);
  const [themeOpen, setThemeOpen] = React.useState(false);
  const { state, load, refreshing, hasWorkspace } = useLiveOpsData({ workspaceId, isActive, includeCompleted });

  const now = state.lastLoadedAt ? state.lastLoadedAt.getTime() : Date.now();
  const feed = React.useMemo(() => {
    const names = new Map(state.subAgents.map((a) => [a.id, a.name]));
    return buildFeed({
      wins,
      now: Math.max(now, Date.now()),
      agentName: (id) => names.get(id) || null,
      server: {
        tasks: state.tasks, schedules: state.schedules, cliTasks: state.cliTasks,
        devServers: state.devServers, liveOps: state.liveOps, jules: state.jules,
      },
    });
  }, [wins, state, now]);

  const onBoard = React.useCallback((id) => Boolean(id && (wins || []).some((w) => w.id === id)), [wins]);
  const canOpen = React.useCallback((item) => onBoard(item.windowId) || Boolean(item.link) || Boolean(OPENS[item.source]), [onBoard]);
  const open = React.useCallback((item) => {
    if (onBoard(item.windowId)) { showWindow(item.windowId); return; }
    if (item.link) { window.open(item.link, '_blank', 'noopener,noreferrer'); return; }
    if (OPENS[item.source]) spawnAt(OPENS[item.source]);
  }, [onBoard, spawnAt]);

  return (
    <>
      <WindowTitle
        icon={<Icon.Monitor size={14} />}
        label={win.title || 'Live Operations'}
        subtitle={state.lastLoadedAt ? `live for everyone on this board · ${fmtTime(state.lastLoadedAt)}` : 'loading'}
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter((a) => a !== id) })}
      >
        <button type="button" className="hb-lo-hood-toggle" aria-pressed={hoodOpen} onClick={() => setHoodOpen((o) => !o)}>
          {hoodOpen ? 'Back to overview' : 'Under the hood'}
        </button>
        <button type="button" title="View agent traces" onClick={() => spawnAt('agent_trace', { title: 'Agentic Tracing' })} style={iconButtonStyle(false)}>
          <Icon.Search size={13} />
        </button>
        <button type="button" title="Refresh" onClick={() => load({ refreshJules: true })} disabled={refreshing} style={iconButtonStyle(refreshing)}>
          <Icon.Refresh size={13} />
        </button>
        <button type="button" title="Theme settings" onClick={() => setThemeOpen((o) => !o)} style={iconButtonStyle(themeOpen)}>
          <Icon.Eye size={13} />
        </button>
      </WindowTitle>

      <div className="hb-lo-body">
        {!hasWorkspace && (
          <div role="status" className="hb-lo-notice">
            Open a workspace to scope schedules and agent tasks. Windows on this board still show here.
          </div>
        )}
        {hoodOpen ? (
          <UnderTheHood state={state} hasWorkspace={hasWorkspace} includeCompleted={includeCompleted} setIncludeCompleted={setIncludeCompleted} />
        ) : (
          <LiveOpsView feed={feed} now={Math.max(now, Date.now())} onOpen={open} canOpen={canOpen} />
        )}
      </div>
      {themeOpen && <ColorSettingsPanel onClose={() => setThemeOpen(false)} />}
    </>
  );
}

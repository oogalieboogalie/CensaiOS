import React, { useState, useCallback } from 'react';
import { pickedWindowTheme, useLookCodeTheme } from './terminal/lookCodeTheme.js';
import { glowTheme } from './terminal/terminalGlow.js';
import { TerminalHeader, AgentRunBar } from './terminal/TerminalUI.jsx';
import { TerminalPane } from './terminal/TerminalPane.jsx';
import { TerminalTabBar, terminalTabKeyAction } from './terminal/TerminalTabBar.jsx';
import {
  terminalTabs, activeTerminalTabId, tabSessionId,
  addTerminalTab, closeTerminalTab, switchTerminalTab,
} from './terminal/terminalTabs.js';
import { useWorkspaceStore } from '../lib/store.js';
import { newId } from '../lib/ids/newId.js';

export function TerminalWindow({ win, onUpdate, currentProject, zoom = 1 }) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const cwd = win.cwd || currentProject?.path || '';
  const glow = Boolean(win.terminalGlow);
  const [showSettings, setShowSettings] = useState(false);
  const [showAgentBar, setShowAgentBar] = useState(false);
  // Uncustomized terminals follow the board's look; a per-window theme
  // (picked from the terminal's gear menu) always wins. The Glow look brings
  // its own neon colors unless the window picked some.
  const lookTheme = useLookCodeTheme();
  const picked = pickedWindowTheme(win.terminalTheme);
  const theme = glow ? glowTheme(picked, lookTheme) : (picked || lookTheme);

  const tabs = terminalTabs(win);
  const activeTab = activeTerminalTabId(win);
  const tabAction = useCallback((action, tabId) => {
    const change = action === 'add' ? addTerminalTab(win)
      : action === 'close' ? closeTerminalTab(win, tabId || activeTab)
        : action === 'select' ? { activeTerminalTab: tabId }
          : switchTerminalTab(win, action === 'prev' ? -1 : 1);
    if (change) onUpdate?.(change);
  }, [win, activeTab, onUpdate]);

  const handleThemeChange = useCallback((newTheme) => {
    onUpdate({ terminalTheme: newTheme });
  }, [onUpdate]);

  React.useEffect(() => {
    if (cwd && win.cwd !== cwd) onUpdate?.({ cwd });
  }, [cwd]);

  return (
    <>
      <TerminalHeader
        win={win} onUpdate={onUpdate}
        showSettings={showSettings} setShowSettings={setShowSettings}
        handleThemeChange={handleThemeChange} theme={theme}
        onAddTab={() => tabAction('add')}
        onRunAgent={() => setShowAgentBar(s => !s)}
      />
      {showAgentBar && (
        <AgentRunBar
          theme={theme}
          defaultCwd={cwd}
          onCancel={() => setShowAgentBar(false)}
          onRun={(task) => {
            setShowAgentBar(false);
            // Same-window run: replaces this session, no window spam.
            // Transcript stays open when done; toast carries the result.
            onUpdate?.({
              title: `Agent · ${task.slice(0, 40)}`,
              agentRun: { prompt: task },
              agentSessionId: newId(),
            });
          }}
        />
      )}
      <TerminalTabBar
        win={win} tabs={tabs} activeId={activeTab} theme={theme}
        onSelect={(id) => tabAction('select', id)}
        onClose={(id) => tabAction('close', id)}
        onAdd={() => tabAction('add')}
      />
      <div
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
        onKeyDownCapture={(event) => {
          const action = terminalTabKeyAction(event);
          if (!action) return;
          event.preventDefault();
          event.stopPropagation();
          tabAction(action);
        }}
      >
        {tabs.map((tab) => (
          <TerminalPane
            key={tab.id}
            win={win} cwd={cwd} theme={theme} workspaceId={workspaceId} glow={glow}
            sessionId={tabSessionId(win, tab)}
            plain={tab.id !== 'main'}
            active={tab.id === activeTab}
          />
        ))}
      </div>
    </>
  );
}

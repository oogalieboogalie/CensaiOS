import React, { useState, useCallback, useMemo, useRef } from 'react';
import { api } from '../lib/api.js';
import { DEFAULT_THEME } from './windows/WindowThemePanel.jsx';
import { useTerminal } from './terminal/useTerminal.js';
import { TerminalHeader, TerminalToolbar, AgentRunBar } from './terminal/TerminalUI.jsx';
import { useWorkspaceStore } from '../lib/store.js';

export function TerminalWindow({ win, onUpdate, currentProject, zoom = 1 }) {
  const hostRef = useRef(null);
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const cwd = win.cwd || currentProject?.path || '';
  const agentEnabled = Boolean(win.agentEnabled);
  const [projects, setProjects] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showAgentBar, setShowAgentBar] = useState(false);
  const theme = win.terminalTheme || DEFAULT_THEME;

  const handleThemeChange = useCallback((newTheme) => {
    onUpdate({ terminalTheme: newTheme });
  }, [onUpdate]);

  React.useEffect(() => {
    let cancelled = false;
    api.getProjects()
      .then((list) => { if (!cancelled) setProjects(Array.isArray(list) ? list : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const mountProject = (nextPath) => {
    const proj = projects.find((p) => p.path === nextPath);
    onUpdate?.({ cwd: nextPath, title: proj?.name ? `Terminal · ${proj.name}` : 'Terminal' });
  };

  const mountableProjects = useMemo(() => {
    const seen = new Set(currentProject?.path ? [currentProject.path] : []);
    return projects.filter((p) => {
      if (!p.path || seen.has(p.path)) return false;
      seen.add(p.path);
      return true;
    });
  }, [projects, currentProject?.path]);

  const { termRef } = useTerminal(hostRef, win, cwd, theme, workspaceId);

  React.useEffect(() => {
    if (cwd && win.cwd !== cwd) onUpdate?.({ cwd });
  }, [cwd]);

  return (
    <>
      <TerminalHeader
        win={win} cwd={cwd} onUpdate={onUpdate}
        showSettings={showSettings} setShowSettings={setShowSettings}
        handleThemeChange={handleThemeChange} theme={theme}
      />
      <TerminalToolbar
        theme={theme} win={win} currentProject={currentProject}
        mountableProjects={mountableProjects} mountProject={mountProject}
        agentEnabled={agentEnabled} onUpdate={onUpdate}
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
              agentSessionId: crypto.randomUUID(),
            });
          }}
        />
      )}
      <div
        ref={hostRef}
        className={win.opacity !== undefined ? 'terminal-translucent' : ''}
        onPointerDown={(event) => {
          event.stopPropagation();
          termRef.current?.focus();
        }}
        onPointerMove={(event) => {
          event.stopPropagation();
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
        }}
        onContextMenu={(event) => {
          event.stopPropagation();
        }}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData?.getData('text');
          if (text && termRef.current) termRef.current.paste(text);
        }}
        style={{
          flex: 1,
          minHeight: 0,
          padding: 0,
          background: win.opacity !== undefined ? 'transparent' : theme.background,
          overflow: 'hidden',
          cursor: 'text',
          userSelect: 'text',
          WebkitUserSelect: 'text',
          MozUserSelect: 'text',
          msUserSelect: 'text',
          zoom: 1,
        }}
      />
    </>
  );
}

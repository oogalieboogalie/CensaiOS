/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { NewTaskForm } from './agentConsole/NewTaskForm.jsx';
import { AgentsSettings } from './agentConsole/AgentsSettings.jsx';
import { TaskView } from './agentConsole/TaskView.jsx';
import { CliMark, StatusDot, stateLabel } from './agentConsole/CliMark.jsx';
import { useCliRoster } from './agentConsole/useCliRoster.js';
import { useCliTask } from './agentConsole/useCliTask.js';
import { cliAgentsApi } from './agentConsole/cliAgentsApi.js';
import './agentConsole/agentConsole.css';

// Agent Console: a coding CLI (Claude Code, Codex, Gemini CLI, OpenCode) as
// a teammate on the board. Give it a task, watch typed steps stream in,
// allow or deny risky steps, review the diff, hand the result on.
// The window only stores which task it shows; the task lives on the server,
// so everyone on the board sees the same run.

function RecentTasks({ onOpen }) {
  const [tasks, setTasks] = React.useState([]);
  React.useEffect(() => {
    let alive = true;
    cliAgentsApi.tasks().then((d) => alive && setTasks((d.tasks || []).slice(0, 6))).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!tasks.length) return null;
  return (
    <div className="ac-recent">
      <div className="ac-label">Recent tasks on this machine</div>
      {tasks.map((t) => (
        <button key={t.id} type="button" className="ac-recent-row" onClick={() => onOpen(t)}>
          <CliMark cli={t.cli} size="sm" />
          <span className="ac-recent-title">{t.title}</span>
          <span className="ac-chip"><StatusDot state={t.status} />{stateLabel(t.status)}</span>
        </button>
      ))}
    </div>
  );
}

export function AgentConsoleWindow({ win = {}, onUpdate, onSpawn }) {
  const roster = useCliRoster();
  const taskId = win.taskId || null;
  const live = useCliTask(taskId);
  const [view, setView] = React.useState(taskId ? 'task' : 'new');

  React.useEffect(() => { if (taskId) setView('task'); }, [taskId]);

  const openTask = (task) => {
    onUpdate?.({ taskId: task.id, cli: task.cli, title: task.cliLabel });
    setView('task');
  };
  const newTask = () => {
    onUpdate?.({ taskId: null, title: 'Agent Console' });
    setView('new');
  };

  const task = live.task;
  const subtitle = view === 'settings'
    ? 'Agents'
    : task && view === 'task' ? stateLabel(task.status) : 'New task';

  let body;
  if (roster.unavailable) {
    body = (
      <div className="ac-empty">
        Coding agents run CLIs on the machine that hosts Homebase, so they are available in the desktop app and self-hosted installs, not on the cloud board.
      </div>
    );
  } else if (view === 'settings') {
    body = <AgentsSettings roster={roster.clis} onOpenToolchains={() => onSpawn?.('toolchainSettings', { title: 'Toolchains' })} />;
  } else if (view === 'task' && taskId) {
    body = <TaskView taskId={taskId} live={live} onSpawn={onSpawn} onNewTask={newTask} />;
  } else {
    body = (
      <div className="ac-scroll">
        <NewTaskForm roster={roster.clis} initialCli={win.cli} initialFolder={win.folder}
          onStarted={(t, { folder }) => { onUpdate?.({ folder }); openTask(t); }} onOpenSettings={() => setView('settings')} />
        <RecentTasks onOpen={openTask} />
      </div>
    );
  }

  return (
    <>
      <WindowTitle icon={<Icon.Terminal size={13} />} label={win.title || 'Agent Console'} subtitle={subtitle}
        actions={[
          view !== 'settings'
            ? { id: 'agents', label: 'Agents', icon: <Icon.Gear size={12} />, title: 'Install CLIs and add keys', onSelect: () => setView('settings') }
            : { id: 'back', label: taskId ? 'Back to task' : 'New task', icon: <Icon.ArrowRight size={12} />, onSelect: () => setView(taskId ? 'task' : 'new') },
        ]} />
      <div className="ac-root" data-testid="agent-console">{body}</div>
    </>
  );
}

export default AgentConsoleWindow;

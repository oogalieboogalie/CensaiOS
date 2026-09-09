import React from 'react';
import { Icon } from '../Icons.jsx';
import { WindowTitle } from '../Windows.jsx';
import { SettingsPanel } from '../windows/WindowThemePanel.jsx';

export function TerminalHeader({ win, cwd, onUpdate, showSettings, setShowSettings, handleThemeChange, theme }) {
  return (
    <>
      <WindowTitle
        accent={theme?.cursor || 'var(--ps-green)'}
        icon={<Icon.Terminal size={14} />}
        label={win.title || 'Terminal'}
        subtitle={cwd || 'sandbox'}
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })}
      >
        <button
          onClick={() => setShowSettings(!showSettings)}
          onPointerDown={(e) => e.stopPropagation()}
          title="Terminal theme settings"
          style={{
            background: showSettings ? 'rgba(96, 165, 250, 0.15)' : 'transparent',
            border: 'none',
            borderRadius: 4,
            padding: 4,
            cursor: 'pointer',
            color: showSettings ? '#60a5fa' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
        >
          <Icon.Gear size={14} />
        </button>
      </WindowTitle>
      {showSettings && (
        <SettingsPanel
          title="Terminal Theme"
          theme={theme}
          onThemeChange={handleThemeChange}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}

export function TerminalToolbar({ theme, win, currentProject, mountableProjects, mountProject, agentEnabled, onUpdate, onRunAgent }) {
  const inAgentRun = Boolean(win.agentRun?.prompt);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', background: theme.background, borderBottom: '1px solid rgba(148,163,184,0.15)' }}>
      {inAgentRun && (
        <button
          onClick={() => onUpdate?.({ agentRun: null, agentSessionId: crypto.randomUUID(), title: 'Terminal' })}
          onPointerDown={(e) => e.stopPropagation()}
          title="End the agent view and open a fresh shell in this window"
          style={{
            flexShrink: 0, background: 'var(--accent-soft)', color: 'var(--accent-ink)',
            border: '1px solid var(--hairline)', borderRadius: 6, fontSize: 10,
            fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
            letterSpacing: '0.06em', padding: '3px 8px', cursor: 'pointer',
          }}
        >
          ← Shell
        </button>
      )}
      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Mounted to</span>
      <select
        value={win.cwd || ''}
        onChange={(e) => mountProject(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        title="Mount this terminal to a project directory"
        style={{ flex: 1, minWidth: 0, background: '#111827', color: '#d7deea', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, fontSize: 11, fontFamily: 'var(--font-mono)', padding: '3px 6px' }}
      >
        <option value="">{currentProject?.path ? `current project (${currentProject.name || currentProject.path})` : 'sandbox (server cwd)'}</option>
        {mountableProjects.map((p) => (
          <option key={p.path} value={p.path}>{p.name || p.path}</option>
        ))}
      </select>
      <button
        onClick={() => onUpdate?.({ agentEnabled: !agentEnabled })}
        onPointerDown={(e) => e.stopPropagation()}
        title={agentEnabled
          ? 'Attached agents can run commands in this terminal. Click to disable.'
          : 'Let attached agents run commands in this shared terminal (you watch live).'}
        style={{
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          background: agentEnabled ? 'rgba(52,211,153,0.15)' : '#111827',
          color: agentEnabled ? '#34d399' : '#94a3b8',
          border: `1px solid ${agentEnabled ? 'rgba(52,211,153,0.4)' : 'rgba(148,163,184,0.25)'}`,
          borderRadius: 6,
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          padding: '3px 8px',
          cursor: 'pointer',
        }}
      >
        <Icon.Bot size={12} /> {agentEnabled ? 'Agent on' : 'Agent off'}
      </button>
      <button
        onClick={() => onRunAgent?.()}
        onPointerDown={(e) => e.stopPropagation()}
        title="Run a headless OpenCode agent in a new terminal on this project (streams live)"
        style={{
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          background: '#111827',
          color: '#94a3b8',
          border: '1px solid rgba(148,163,184,0.25)',
          borderRadius: 6,
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          padding: '3px 8px',
          cursor: 'pointer',
        }}
      >
        ▶ Run agent
      </button>
    </div>
  );
}

export function AgentRunBar({ theme, defaultCwd, onRun, onCancel }) {
  const [prompt, setPrompt] = React.useState('');
  const inputRef = React.useRef(null);
  React.useEffect(() => { inputRef.current?.focus(); }, []);
  const submit = () => {
    if (prompt.trim()) onRun?.(prompt.trim());
  };
  return (
    <div style={{ display: 'flex', gap: 6, padding: '6px 8px', background: theme.background, borderBottom: '1px solid rgba(148,163,184,0.15)', alignItems: 'center' }}>
      <input
        ref={inputRef}
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onCancel?.();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        placeholder={defaultCwd ? `Ask the agent to do something in ${defaultCwd}…` : 'Ask the agent to do something… (needs a project folder)'}
        style={{ flex: 1, background: '#111827', color: '#d7deea', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, fontSize: 11, fontFamily: 'var(--font-mono)', padding: '5px 8px', outline: 'none' }}
      />
      <button
        onClick={submit}
        onPointerDown={(e) => e.stopPropagation()}
        disabled={!prompt.trim()}
        title="Run in a new terminal"
        style={{ all: 'unset', cursor: prompt.trim() ? 'pointer' : 'not-allowed', fontSize: 11, color: 'var(--accent-ink)', padding: '4px 10px', borderRadius: 6, background: 'var(--accent-soft)', fontWeight: 600, opacity: prompt.trim() ? 1 : 0.45 }}
      >
        Run
      </button>
    </div>
  );
}

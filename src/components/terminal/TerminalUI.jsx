import React from 'react';
import { Icon } from '../Icons.jsx';
import { WindowTitle } from '../Windows.jsx';
import { SettingsPanel } from '../windows/WindowThemePanel.jsx';

function HeaderButton({ on, title, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      title={title}
      aria-pressed={on}
      style={{
        background: on ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : 'transparent',
        border: 'none', borderRadius: 'var(--radius-sm)', padding: '2px 5px', cursor: 'pointer',
        color: on ? 'var(--accent)' : 'var(--ink-faint)', display: 'flex', alignItems: 'center', gap: 3,
        fontSize: 'var(--text-xs)', fontFamily: 'var(--font-label)', textTransform: 'var(--label-case)',
        letterSpacing: 'var(--label-tracking)',
      }}
    >
      {children}
    </button>
  );
}

// The terminal's one header: the frame's shared title bar (with its close
// and menu controls, and the "Mount to" chip). No second bar under it: the
// agent switches sit in the header's "..." menu.
export function TerminalHeader({ win, onUpdate, showSettings, setShowSettings, handleThemeChange, theme, onAddTab, onRunAgent }) {
  const glow = Boolean(win.terminalGlow);
  const agentEnabled = Boolean(win.agentEnabled);
  const inAgentRun = Boolean(win.agentRun?.prompt);
  return (
    <>
      <WindowTitle
        accent={theme?.cursor || 'var(--ps-green)'}
        icon={<Icon.Terminal size={14} />}
        label={win.title || 'Terminal'}
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })}
        menu={[
          {
            id: 'agent-access',
            label: agentEnabled ? 'Agents can run commands here: on' : 'Agents can run commands here: off',
            icon: <Icon.Bot size={12} />,
            title: agentEnabled
              ? 'Attached agents can run commands in this terminal. Click to turn it off.'
              : 'Let attached agents run commands in this shared terminal (you watch live).',
            onSelect: () => onUpdate?.({ agentEnabled: !agentEnabled }),
          },
          {
            id: 'run-agent',
            label: 'Run an agent here…',
            title: 'Run a headless OpenCode agent in this terminal on this folder (streams live)',
            onSelect: () => onRunAgent?.(),
          },
        ]}
      >
        {inAgentRun && (
          <HeaderButton
            title="End the agent view and open a fresh shell in this window"
            onClick={() => onUpdate?.({ agentRun: null, agentSessionId: crypto.randomUUID(), title: 'Terminal' })}
          >
            ← Shell
          </HeaderButton>
        )}
        <HeaderButton title="New tab: another shell in this window (Ctrl+Shift+T)" onClick={onAddTab}>
          <Icon.Plus size={13} />
        </HeaderButton>
        <HeaderButton
          on={glow}
          title={glow ? 'Glow look is on: pixel font, glowing colors. Click for the normal look.' : 'Glow look: pixel font with glowing colors'}
          onClick={() => onUpdate({ terminalGlow: !glow })}
        >
          Glow
        </HeaderButton>
        <button
          onClick={() => setShowSettings(!showSettings)}
          onPointerDown={(e) => e.stopPropagation()}
          title="Terminal theme settings"
          style={{
            background: showSettings ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            padding: 4,
            cursor: 'pointer',
            color: showSettings ? 'var(--accent)' : 'var(--ink-faint)',
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

export function AgentRunBar({ theme, defaultCwd, onRun, onCancel }) {
  const [prompt, setPrompt] = React.useState('');
  const inputRef = React.useRef(null);
  React.useEffect(() => { inputRef.current?.focus(); }, []);
  const submit = () => {
    if (prompt.trim()) onRun?.(prompt.trim());
  };
  return (
    <div style={{ display: 'flex', gap: 6, padding: '6px 8px', background: theme.background, borderBottom: '1px solid var(--hairline)', alignItems: 'center' }}>
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
        style={{ flex: 1, background: 'var(--surface-sunken)', color: 'var(--ink)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', padding: '5px 8px', outline: 'none' }}
      />
      <button
        onClick={submit}
        onPointerDown={(e) => e.stopPropagation()}
        disabled={!prompt.trim()}
        title="Run in a new terminal"
        style={{ all: 'unset', cursor: prompt.trim() ? 'pointer' : 'not-allowed', fontSize: 'var(--text-xs)', color: 'var(--accent-ink)', padding: '4px 10px', borderRadius: 'var(--radius-md)', background: 'var(--accent-soft)', fontWeight: 600, opacity: prompt.trim() ? 1 : 0.45 }}
      >
        Run
      </button>
    </div>
  );
}

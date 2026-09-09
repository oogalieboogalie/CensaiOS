const CLI_ICONS = { opencode: '⚡', gemini: '✦', codex: '◈', claudecode: '◉' };

// status: 'unknown' | 'checking' | 'installed' | 'missing' | 'installing' | 'error'
const STATUS_COLORS = {
  unknown:    'var(--tc-dot-unknown)',
  checking:   'var(--tc-dot-checking)',
  installed:  'var(--tc-dot-installed)',
  missing:    'var(--tc-dot-missing)',
  installing: 'var(--tc-dot-checking)',
  error:      'var(--tc-dot-error)',
};

const STATUS_LABELS = {
  unknown:    'Unknown',
  checking:   'Checking…',
  installed:  'Installed',
  missing:    'Not installed',
  installing: 'Installing…',
  error:      'Error',
};

export function ToolchainCard({ tool, status, version, baked, log, sandboxUp, onInstall, onToggleBake }) {
  const isInstalling = status === 'installing';

  return (
    <div className={`tc-card ${baked ? 'tc-card--baked' : ''}`}>

      {/* Left: icon + info */}
      <div className="tc-card-left">
        <span className="tc-card-icon">{CLI_ICONS[tool.id] || '◆'}</span>
        <div>
          <div className="tc-card-name">{tool.label}</div>
          <div className="tc-card-desc">{tool.description}</div>
          {version && <div className="tc-card-version">{version}</div>}
          {log && <div className={`tc-card-log ${status === 'error' ? 'tc-card-log--error' : ''}`}>{log}</div>}
        </div>
      </div>

      {/* Right: status dot + actions */}
      <div className="tc-card-right">
        {/* Status dot */}
        <div className="tc-status-wrap" title={STATUS_LABELS[status]}>
          <span
            className={`tc-dot ${status === 'checking' || status === 'installing' ? 'tc-dot--pulse' : ''}`}
            style={{ background: STATUS_COLORS[status] }}
          />
          <span className="tc-status-label">{STATUS_LABELS[status]}</span>
        </div>

        {/* Quick install (session only) */}
        {status === 'missing' && sandboxUp && (
          <button
            className="tc-action-btn"
            onClick={() => onInstall(tool.id)}
            disabled={isInstalling}
            title="Install into running sandbox (this session only)"
          >
            Install now
          </button>
        )}

        {/* Copy install command */}
        <button
          className="tc-action-btn tc-action-btn--secondary"
          onClick={() => navigator.clipboard.writeText(tool.installCmd)}
          title={tool.installCmd}
        >
          📋 Copy cmd
        </button>

        {/* Bake-in toggle */}
        <button
          className={`tc-bake-btn ${baked ? 'tc-bake-btn--on' : ''}`}
          onClick={() => onToggleBake(tool.id)}
          title={baked ? 'Remove from image — won\'t be installed on next rebuild' : 'Bake into image — installed on every restart'}
        >
          {baked ? '📌 Baked in' : '📌 Bake in'}
        </button>
      </div>
    </div>
  );
}

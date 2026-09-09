import React from 'react';
import { Icon } from './Icons.jsx';
import { PSButton } from './chrome/Buttons.jsx';
import { FileMenu } from './chrome/FileMenu.jsx';
import { WindowMenu } from './topbar/WindowMenu.jsx';
import { useEscapeDismiss } from '../lib/useEscapeDismiss.js';

function formatTopClock(d) {
  const day = d.toLocaleDateString(undefined, { weekday: 'short' });
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${date} · ${time}`;
}

export function Chrome({
  onNewTerminal, onNewHtmlPreview,
  onSpawnRook, onNewMailcow, onNewVex, onSpawn, onToggleFocus,
  focusMode, penMode = false, onTogglePenMode, projectName, currentProject, 
  onOpenLocalProject, onOpenSettings, onMin, onMax, onClose, presets = [], 
  onSaveAsPreset, onLoadPreset, onDeletePreset, windowControlState = null,
}) {
  const [idle, setIdle] = React.useState(false);
  const [folded, setFolded] = React.useState(false);
  const [showFiles, setShowFiles] = React.useState(false);
  const [now, setNow] = React.useState(() => formatTopClock(new Date()));
  const idleTimer = React.useRef(null);
  useEscapeDismiss(showFiles, () => setShowFiles(false));

  React.useEffect(() => {
    const wake = () => { setIdle(false); clearTimeout(idleTimer.current); idleTimer.current = setTimeout(() => setIdle(true), 4000); };
    wake();
    window.addEventListener('mousemove', wake); window.addEventListener('keydown', wake);
    return () => { window.removeEventListener('mousemove', wake); window.removeEventListener('keydown', wake); clearTimeout(idleTimer.current); };
  }, []);

  React.useEffect(() => {
    const t = setInterval(() => setNow(formatTopClock(new Date())), 60_000);
    return () => clearInterval(t);
  }, []);

  const fade = idle || focusMode;

  const maximizeTitle = windowControlState?.maximizeTitle || (focusMode ? 'Exit focus' : 'Focus mode');
  const minimizeTitle = windowControlState?.minimizeTitle || 'Minimize';
  const closeTitle = windowControlState?.closeTitle || 'Close';
  const showWindowMaximize = windowControlState?.showWindowMaximize || false;
  const activeWindow = windowControlState?.activeWindow || null;

  return (
    <>
      <div style={{ position: 'fixed', top: 0, left: 12, transform: `translateY(${folded ? '-100%' : '0'})`, transition: 'transform 0.4s cubic-bezier(.4,.0,.2,1), opacity 0.4s', opacity: fade ? 0 : 1, zIndex: 50 }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }} onMouseLeave={(e) => { if (fade) e.currentTarget.style.opacity = 0; }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, padding: '7px 12px 9px', boxShadow: 'var(--shadow-card)', display: 'inline-flex', alignItems: 'center', gap: 10, width: 'max-content' }}>
          <img src="/assets/app-icon-64.png" alt="Censai logo" style={{ height: 24, width: 24, borderRadius: 4 }} />
          <button title="File menu" onClick={() => setShowFiles(s => !s)} style={{ all: 'unset', cursor: 'pointer', width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--ink-soft)', background: showFiles ? 'var(--surface-2)' : 'transparent' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 4h10M3 8h10M3 12h10"/></svg>
          </button>
          <div style={{ width: 1, height: 18, background: 'var(--hairline)' }} />
          <WindowMenu onSpawn={onSpawn} />
          <div style={{ width: 1, height: 18, background: 'var(--hairline)' }} />
          <button title="Fold toolbar" onClick={() => setFolded(true)} style={{ all: 'unset', cursor: 'pointer', width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--ink-soft)' }}><Icon.Up size={16}/></button>
        </div>
        {showFiles && <FileMenu onClose={() => setShowFiles(false)} projectName={projectName}
          currentProject={currentProject}
          onOpenLocalProject={onOpenLocalProject}
          presets={presets}
          onSaveAsPreset={onSaveAsPreset}
          onLoadPreset={onLoadPreset}
          onDeletePreset={onDeletePreset}
          onNewTerminal={onNewTerminal}
          onNewHtmlPreview={onNewHtmlPreview}
          onSpawnRook={onSpawnRook}
          onNewMailcow={onNewMailcow}
          onNewVex={onNewVex}
        />}
      </div>
      {folded && <div style={{ position: 'fixed', top: 0, left: 12, zIndex: 50, opacity: idle && !focusMode ? 0.3 : 1, transition: 'opacity 0.3s' }}>
        <button onClick={() => setFolded(false)} title="Show toolbar" style={{ all: 'unset', cursor: 'pointer', padding: '4px 14px 5px', background: 'var(--surface)', border: '1px solid var(--hairline)', borderTop: 'none', borderBottomLeftRadius: 14, borderBottomRightRadius: 14, boxShadow: 'var(--shadow-card)', color: 'var(--ink-faint)' }}><Icon.Down size={14}/></button>
      </div>}
      <div style={{ position: 'fixed', top: 0, right: 0, zIndex: 50, opacity: fade ? 0 : 1, transition: 'opacity 0.4s' }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }} onMouseLeave={(e) => { if (fade) e.currentTarget.style.opacity = 0; }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderTop: 'none', borderRight: 'none', borderBottomLeftRadius: 18, padding: '8px 12px', boxShadow: 'var(--shadow-card)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onOpenSettings} title="Settings" style={{ all: 'unset', cursor: 'pointer', width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--ink-soft)' }}><Icon.Gear size={16} /></button>
          <button
            onClick={onTogglePenMode}
            title={penMode ? 'Disable pen mode' : 'Enable pen mode'}
            style={{
              all: 'unset',
              cursor: 'pointer',
              width: 26,
              height: 26,
              borderRadius: 8,
              display: 'grid',
              placeItems: 'center',
              color: penMode ? 'var(--accent-ink)' : 'var(--ink-soft)',
              background: penMode ? 'var(--accent-soft)' : 'transparent',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
          <div style={{ width: 1, height: 18, background: 'var(--hairline)' }} />
          <PSButton color="var(--ps-green)" title={minimizeTitle} onClick={onMin}><Icon.Minimize size={11} stroke={2.4}/></PSButton>
          <PSButton color="var(--ps-blue)" title={maximizeTitle} onClick={onMax}>
            {showWindowMaximize
              ? (activeWindow?.maximized ? <Icon.Restore size={10} /> : <Icon.Maximize size={10} stroke={2.2} />)
              : (focusMode ? <Icon.Eye size={10} /> : <Icon.Maximize size={10} stroke={2.2} />)}
          </PSButton>
          <PSButton color="var(--ps-red)" title={closeTitle} onClick={onClose}><Icon.Close size={10} stroke={2.4}/></PSButton>
        </div>
      </div>
      {projectName && <div style={{ position: 'fixed', top: 14, left: 0, right: 0, textAlign: 'center', pointerEvents: 'none', zIndex: 5, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)', opacity: 0.55 }}>
        {(projectName.toLowerCase() === 'homebase' ? 'Censai' : projectName)} · {now}
      </div>}
    </>
  );
}

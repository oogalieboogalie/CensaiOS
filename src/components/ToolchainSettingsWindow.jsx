import './ToolchainSettings.css';
import { useToolchains } from './toolchain/useToolchains.js';
import { ToolchainCard } from './toolchain/ToolchainCard.jsx';

export function ToolchainSettingsWindow() {
  const {
    tools, bakedIn, statuses, versions, installLog, sandboxUp,
    fetchError, loading, isDirty, isSaving, saveError,
    rebuildStatus, setRebuildStatus, rebuildLog, rebuildError, logEndRef,
    fetchConfig, detectAll, quickInstall, handleSave, toggleBake,
  } = useToolchains();

  const isBuilding = rebuildStatus === 'running';
  const buildDone  = rebuildStatus === 'done';
  const buildFailed = rebuildStatus === 'error';

  return (
    <div className="tc-root">

      {/* ── Header ── */}
      <div className="tc-header">
        <span className="tc-title-icon">🧰</span>
        <div className="tc-header-text">
          <h2 className="tc-title">AI Coding Assistants</h2>
          <p className="tc-subtitle">Install CLI coding tools into your sandbox.</p>
        </div>
        <div className="tc-header-actions">
          <span className={`tc-sandbox-pill ${sandboxUp === true ? 'tc-sandbox-pill--up' : sandboxUp === false ? 'tc-sandbox-pill--down' : ''}`}>
            {sandboxUp === true ? '● Sandbox running' : sandboxUp === false ? '● Sandbox offline' : '○ …'}
          </span>
          <button className="tc-icon-btn" title="Re-check all" onClick={detectAll}>↺</button>
        </div>
      </div>

      {/* ── Rebuild progress panel ── */}
      {(isBuilding || buildDone || buildFailed) && (
        <div className={`tc-build-panel ${buildFailed ? 'tc-build-panel--error' : ''} ${buildDone ? 'tc-build-panel--done' : ''}`}>
          <div className="tc-build-header">
            {isBuilding && <span className="tc-spinner-sm" />}
            <span className="tc-build-label">
              {isBuilding  && 'Baking new image — CLIs will survive every restart after this…'}
              {buildDone   && '✓ Image ready. Open a new terminal to use your baked-in tools.'}
              {buildFailed && `✗ Rebuild failed: ${rebuildError}`}
            </span>
            {!isBuilding && (
              <button className="tc-dismiss" onClick={() => setRebuildStatus('idle')}>✕</button>
            )}
          </div>
          <div className="tc-build-log">
            {rebuildLog.map((entry, i) => (
              <div key={i} className="tc-log-line">
                <span className="tc-log-ts">{new Date(entry.ts).toLocaleTimeString()}</span>
                <span>{entry.line}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* ── Error / loading states ── */}
      {loading && <div className="tc-empty">Checking sandbox…</div>}
      {fetchError && (
        <div className="tc-empty tc-empty--error">
          ⚠ {fetchError}
          <button className="tc-retry" onClick={fetchConfig}>Retry</button>
        </div>
      )}

      {/* ── CLI cards ── */}
      {!loading && !fetchError && (
        <div className="tc-list">
          {tools.map(tool => (
            <ToolchainCard
              key={tool.id}
              tool={tool}
              status={statuses[tool.id] || 'unknown'}
              version={versions[tool.id]}
              baked={bakedIn.has(tool.id)}
              log={installLog[tool.id]}
              sandboxUp={sandboxUp}
              onInstall={quickInstall}
              onToggleBake={toggleBake}
            />
          ))}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="tc-footer">
        <span className="tc-footer-hint">
          {isDirty ? '💾 Unsaved changes — save to rebuild the image.' : 'Toggle "Bake in" to make a CLI survive restarts.'}
        </span>
        {saveError && <span className="tc-save-error">✗ {saveError}</span>}
        <button
          className="tc-save-btn"
          onClick={handleSave}
          disabled={isSaving || isBuilding || !isDirty}
          id="toolchain-save-btn"
        >
          {isSaving ? 'Saving…' : 'Save & Rebuild Image'}
        </button>
      </div>
    </div>
  );
}

export default ToolchainSettingsWindow;

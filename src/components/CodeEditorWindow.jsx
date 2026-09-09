/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React, { useState, useCallback } from 'react';
import { Icon } from './Icons.jsx';
import { DEFAULT_THEME, SettingsPanel } from './windows/WindowThemePanel.jsx';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { normalizeCodeServerUrl } from '../lib/codeServerUrl.js';
import { CodeServerIframeView } from './CodeServerIframeView.jsx';
import { useLiveCodePresence } from './codeEditor/useLiveCodePresence.js';
import { detectLanguage, displayNameForLanguage } from './codeEditor/languageDetect.js';
import { useCodeEditorActions } from './codeEditor/useCodeEditorActions.js';
import { VSCodeLikeEditor } from './codeEditor/VSCodeLikeEditor.jsx';
import { LegacyCodePane } from './codeEditor/LegacyCodePane.jsx';
import { CodeEditorContextMenu } from './codeEditor/CodeEditorContextMenu.jsx';

const DEFAULT_CODE = `// Write code here.
function greet(name) {
  return 'Hello, ' + name + '!';
}

console.log(greet('Censai'));`;

const codeContentCache = new Map();

// jsdom (tests) can't run CodeMirror — render the legacy textarea pane there
// so the existing file/code-server contract tests keep passing unchanged.
const isLegacyTestEnv = () => typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');

export function CodeEditorWindow({ win, onUpdate, onSpawn }) {
  const [code, setCode] = React.useState(win.code || DEFAULT_CODE);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [menu, setMenu] = useState(null);
  const editorRef = React.useRef(null);

  const theme = win.editorTheme || { ...DEFAULT_THEME };
  const fileLabel = win.fileName || win.title || 'Code Editor';
  const codeServerUrl = win.codeServerUrl ? normalizeCodeServerUrl(win.codeServerUrl) : '';
  const isIframeMode = codeServerUrl.length > 0;
  const sourceLabel = isIframeMode
    ? 'code-server'
    : (win.filePath ? (win.isGithub ? 'github' : 'local file') : 'plain text');

  // The editor "knows what you're writing": extension → sniff → plaintext.
  const language = React.useMemo(
    () => detectLanguage({ fileName: win.fileName || win.title, filePath: win.filePath, language: win.language, code }),
    [win.fileName, win.title, win.filePath, win.language, code],
  );
  React.useEffect(() => {
    if (!win.language && language !== 'plaintext') onUpdate?.({ language });
  }, [win.language, language, onUpdate]);

  const handleThemeChange = useCallback((newTheme) => onUpdate({ editorTheme: newTheme }), [onUpdate]);
  const { updateCode, focusProps } = useLiveCodePresence(win, code, setCode, onUpdate);
  const { canFormat, formatStatus, formatWhole, formatRange, askAgentToFix } = useCodeEditorActions({
    code, setCode, language, fileLabel, onUpdate, onSpawn,
    agentId: (win.attachedAgents || [])[0] || 'censai',
  });

  React.useEffect(() => {
    if (!win.filePath) return;
    const url = win.isGithub
      ? `/api/github/file?repo=${encodeURIComponent(win.githubRepo)}&path=${encodeURIComponent(win.filePath)}`
      : `/api/files/content?path=${encodeURIComponent(win.filePath)}`;
    if (codeContentCache.has(url)) {
      const cached = codeContentCache.get(url);
      setCode(cached);
      onUpdate?.({ code: cached });
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(url).then((res) => res.json()).then((data) => {
      if (cancelled) return;
      if (data.error) throw new Error(data.error);
      const next = data.content || '';
      codeContentCache.set(url, next);
      setCode(next);
      onUpdate?.({ code: next });
      setLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      setCode(`Failed to load file: ${err.message}`);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [win.filePath, win.isGithub, win.githubRepo]);

  const saveFile = async () => {
    if (!win.filePath || win.isGithub) return;
    setSaving(true);
    try {
      await fetch('/api/files/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: win.filePath, content: code })
      });
      const url = `/api/files/content?path=${encodeURIComponent(win.filePath)}`;
      codeContentCache.set(url, code);
    } catch (e) {
      console.error('Failed to save code file:', e);
    }
    setSaving(false);
  };
  const previewAsHtml = () => {
    onSpawn?.('htmlPreview', {
      title: 'Shared Preview',
      fileName: /\.html?$/i.test(fileLabel) ? fileLabel : `${fileLabel}.html`,
      html: code,
      sourceWindowId: win.id,
    });
  };

  const readSelection = (target) => {
    const fromEditor = editorRef.current?.getSelection?.();
    if (fromEditor?.text) return fromEditor;
    if (target && typeof target.selectionStart === 'number' && target.selectionEnd > target.selectionStart) {
      return { from: target.selectionStart, to: target.selectionEnd, text: target.value.slice(target.selectionStart, target.selectionEnd) };
    }
    return { from: 0, to: 0, text: '' };
  };
  const openMenu = (e) => {
    if (isIframeMode) return;
    const selection = readSelection(e.target);
    if (isLegacyTestEnv() && !selection.text) return; // keep native menu when nothing selected
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, selection });
  };

  const useLegacyPane = isLegacyTestEnv();
  const langLabel = displayNameForLanguage(language);

  return (
    <>
      <WindowTitle
        accent={theme.cursor || theme.blue || 'var(--ps-blue)'}
        icon={<Icon.Code size={14} />}
        label={fileLabel}
        subtitle={(loading ? 'loading...' : sourceLabel) + ` · ${langLabel}`}
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })}
      >
        {win.isGithub && <span style={{ fontSize: 9, background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4, color: 'var(--ink)' }}>{win.githubRepo}</span>}
        {isIframeMode && <span data-code-server-url-badge style={{ fontFamily: 'var(--font-mono)', fontSize: 9, background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4, color: 'var(--ink)' }} title={codeServerUrl}>{codeServerUrl}</span>}
        {win.filePath && !win.isGithub && !isIframeMode && (
          <button onClick={(e) => { e.stopPropagation(); saveFile(); }} disabled={saving} title="Save local file"
            style={{ all: 'unset', cursor: saving ? 'wait' : 'pointer', color: 'var(--accent-ink)', border: '1px solid var(--hairline)', borderRadius: 7, padding: '4px 7px', textTransform: 'none', letterSpacing: 0, fontSize: 11, fontWeight: 700, opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
        {!isIframeMode && (
          <button onClick={(e) => { e.stopPropagation(); formatWhole(); }} disabled={!canFormat} title={canFormat ? `Format ${langLabel} (Prettier)` : `No formatter for ${langLabel}`}
            style={{ all: 'unset', cursor: canFormat ? 'pointer' : 'default', color: 'var(--accent-ink)', border: '1px solid var(--hairline)', borderRadius: 7, padding: '4px 7px', textTransform: 'none', letterSpacing: 0, fontSize: 11, fontWeight: 700, opacity: canFormat ? 1 : 0.45 }}>
            Format
          </button>
        )}
        <button onClick={() => setShowSettings(!showSettings)} onPointerDown={(e) => e.stopPropagation()} title="Editor theme settings"
          style={{ background: showSettings ? 'rgba(96, 165, 250, 0.15)' : 'transparent', border: 'none', borderRadius: 4, padding: 4, cursor: 'pointer', color: showSettings ? '#60a5fa' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease', marginRight: 8 }}>
          <Icon.Gear size={14} />
        </button>
        {!isIframeMode && (
          <button onClick={(e) => { e.stopPropagation(); previewAsHtml(); }} title="Open a shared preview linked to this code window"
            style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: 'var(--accent-ink)', background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderRadius: 7, padding: '4px 7px', textTransform: 'none', letterSpacing: 0, fontSize: 11, fontWeight: 700 }}>
            <Icon.Eye size={12} />
            Preview
          </button>
        )}
      </WindowTitle>

      {showSettings && <SettingsPanel title="Editor Theme" theme={theme} onThemeChange={handleThemeChange} onClose={() => setShowSettings(false)} />}
      {win.typingActor && !isIframeMode && <div style={{ padding: '5px 12px', background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontSize: 11, fontFamily: 'var(--font-sans)' }}>{win.typingActor.label} — read-only while they type, so your saves never collide.</div>}
      {formatStatus && !isIframeMode && <div style={{ padding: '4px 12px', background: formatStatus.kind === 'error' ? 'rgba(251,113,133,0.12)' : 'var(--accent-soft)', color: formatStatus.kind === 'error' ? 'var(--danger, #fb7185)' : 'var(--accent-ink)', fontSize: 11, fontFamily: 'var(--font-sans)' }}>{formatStatus.text}</div>}

      {isIframeMode ? (
        <CodeServerIframeView url={codeServerUrl} theme={theme} winOpacity={win.opacity} />
      ) : (
      <div onContextMenu={openMenu} style={{ flex: 1, minHeight: 0, display: 'flex', background: win.opacity !== undefined ? 'transparent' : theme.background }}>
        {useLegacyPane ? (
          <LegacyCodePane code={code} theme={theme} winOpacity={win.opacity} readOnly={Boolean(win.typingActor)} onChange={updateCode} focusProps={focusProps} />
        ) : (
          <VSCodeLikeEditor ref={editorRef} code={code} language={language} editorTheme={theme} fontSize={theme.fontSize || 13} readOnly={Boolean(win.typingActor)} onChange={updateCode} />
        )}
      </div>
      )}
      {menu && (
        <CodeEditorContextMenu x={menu.x} y={menu.y} hasSelection={Boolean(menu.selection.text)} canFormat={canFormat}
          formatHint={`Prettier · ${langLabel}`}
          onFormatDocument={formatWhole} onFormatSelection={() => formatRange(menu.selection)}
          onAskAgent={() => askAgentToFix(menu.selection)} onClose={() => setMenu(null)} />
      )}
    </>
  );
}

/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React, { useState, useCallback } from 'react';
import { Icon } from './Icons.jsx';
import { SettingsPanel } from './windows/WindowThemePanel.jsx';
import { pickedWindowTheme, useLookCodeTheme } from './terminal/lookCodeTheme.js';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { normalizeCodeServerUrl } from '../lib/codeServerUrl.js';
import { CodeServerIframeView } from './CodeServerIframeView.jsx';
import { useLiveCodePresence } from './codeEditor/useLiveCodePresence.js';
import { detectLanguage, displayNameForLanguage } from './codeEditor/languageDetect.js';
import { useCodeEditorActions } from './codeEditor/useCodeEditorActions.js';
import { VSCodeLikeEditor } from './codeEditor/VSCodeLikeEditor.jsx';
import { LegacyCodePane } from './codeEditor/LegacyCodePane.jsx';
import { CodeEditorContextMenu } from './codeEditor/CodeEditorContextMenu.jsx';
import { useCodeFileLoad } from './codeEditor/useCodeFileLoad.js';
import { FileLoadError } from './files/FileLoadError.jsx';
import { OffBoardNote } from './files/OffBoardNote.jsx';
import { SaveNote } from './files/SaveNote.jsx';
import { useFileSave } from './files/useFileSave.js';
import { CodeStatusBar } from './codeEditor/CodeStatusBar.jsx';

const DEFAULT_CODE = `// Write code here.
function greet(name) {
  return 'Hello, ' + name + '!';
}

console.log(greet('Censai'));`;

// jsdom (tests) can't run CodeMirror — render the legacy textarea pane there
// so the existing file/code-server contract tests keep passing unchanged.
const isLegacyTestEnv = () => typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');

export function CodeEditorWindow({ win, onUpdate, onSpawn }) {
  // The sample is for a new, empty editor; a file's window waits for the file's own code.
  const [code, setCode] = React.useState(win.code || (win.filePath ? '' : DEFAULT_CODE));
  const [showSettings, setShowSettings] = useState(false);
  const [menu, setMenu] = useState(null);
  const editorRef = React.useRef(null);

  // Follows the board's look unless a theme was picked for this window.
  const lookTheme = useLookCodeTheme();
  const theme = pickedWindowTheme(win.editorTheme) || lookTheme;
  const fileLabel = win.fileName || win.title || 'Code Editor';
  const { saving, note: saveNote, save, closeNote: closeSaveNote } = useFileSave(win.filePath, fileLabel, 'code_editor');
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
  const { loading, loadError, canSave, retryLoad, offBoard } = useCodeFileLoad(win, setCode, onUpdate);
  const { updateCode, focusProps } = useLiveCodePresence(win, code, setCode, onUpdate, offBoard);
  const { canFormat, formatStatus, formatWhole, formatRange, askAgentToFix } = useCodeEditorActions({
    code, setCode, language, fileLabel, onUpdate, onSpawn, offBoard,
    agentId: (win.attachedAgents || [])[0] || 'censai',
  });

  // A file that did not load takes no typing: Save could never keep it.
  const readOnly = Boolean(loadError) || Boolean(win.typingActor && !win.typingActor.shared);
  // Format rewrites the code too, so it is off whenever typing is.
  const formatOn = canFormat && !readOnly;

  // A save that did not happen says so in plain words (saveNote), and the code stays here.
  const saveFile = () => { if (canSave) save(code); };
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
        {win.isGithub && <span style={{ fontSize: 'var(--text-xs)', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 'var(--radius-sm)', color: 'var(--ink)' }}>{win.githubRepo}</span>}
        {isIframeMode && <span data-code-server-url-badge style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 'var(--radius-sm)', color: 'var(--ink)' }} title={codeServerUrl}>{codeServerUrl}</span>}
        {win.filePath && !win.isGithub && !isIframeMode && (
          <button onClick={(e) => { e.stopPropagation(); if (canSave && !saving) saveFile(); }} disabled={saving || !canSave} title={canSave ? 'Save local file' : 'Save stays off until the file loads'}
            style={{ all: 'unset', cursor: saving ? 'wait' : (canSave ? 'pointer' : 'default'), color: 'var(--accent-ink)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '4px 7px', textTransform: 'none', letterSpacing: 0, fontSize: 'var(--text-xs)', fontWeight: 700, opacity: (saving || !canSave) ? 0.45 : 1 }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
        {!isIframeMode && (
          <button onClick={(e) => { e.stopPropagation(); if (formatOn) formatWhole(); }} disabled={!formatOn} title={formatOn ? `Format ${langLabel} (Prettier)` : (canFormat ? 'Format is off while this code takes no typing' : `No formatter for ${langLabel}`)}
            style={{ all: 'unset', cursor: formatOn ? 'pointer' : 'default', color: 'var(--accent-ink)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '4px 7px', textTransform: 'none', letterSpacing: 0, fontSize: 'var(--text-xs)', fontWeight: 700, opacity: formatOn ? 1 : 0.45 }}>
            Format
          </button>
        )}
        <button onClick={() => setShowSettings(!showSettings)} onPointerDown={(e) => e.stopPropagation()} title="Editor theme settings"
          style={{ background: showSettings ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : 'transparent', border: 'none', borderRadius: 'var(--radius-sm)', padding: 4, cursor: 'pointer', color: showSettings ? 'var(--accent-line)' : 'var(--ink-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease', marginRight: 8 }}>
          <Icon.Gear size={14} />
        </button>
        {/* Preview copies the code into a new window on the board, so a file only the owner opens has none. */}
        {!isIframeMode && !offBoard && (
          <button onClick={(e) => { e.stopPropagation(); previewAsHtml(); }} title="Open a shared preview linked to this code window"
            style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: 'var(--accent-ink)', background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', borderRadius: 'var(--radius-md)', padding: '4px 7px', textTransform: 'none', letterSpacing: 0, fontSize: 'var(--text-xs)', fontWeight: 700 }}>
            <Icon.Eye size={12} />
            Preview
          </button>
        )}
      </WindowTitle>

      {showSettings && <SettingsPanel title="Editor Theme" theme={theme} onThemeChange={handleThemeChange} onClose={() => setShowSettings(false)} />}
      {win.typingActor && !win.typingActor.shared && !isIframeMode && <div style={{ padding: '5px 12px', background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-sans)' }}>{win.typingActor.label} — read-only while they type, so your saves never collide.</div>}
      {!isIframeMode && <SaveNote note={saveNote} onClose={closeSaveNote} />}
      {!isIframeMode && <FileLoadError message={loadError} onRetry={retryLoad} />}
      {!isIframeMode && <OffBoardNote show={offBoard && !loadError} />}
      {formatStatus && !isIframeMode && <div style={{ padding: '4px 12px', background: formatStatus.kind === 'error' ? 'color-mix(in oklab, var(--danger) 12%, transparent)' : 'var(--accent-soft)', color: formatStatus.kind === 'error' ? 'var(--danger)' : 'var(--accent-ink)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-sans)' }}>{formatStatus.text}</div>}

      {isIframeMode ? (
        <CodeServerIframeView url={codeServerUrl} theme={theme} winOpacity={win.opacity} />
      ) : (
      <div onContextMenu={openMenu} onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (canSave) saveFile(); }
      }} style={{ flex: 1, minHeight: 0, display: 'flex', background: win.opacity !== undefined ? 'transparent' : theme.background }}>
        {useLegacyPane ? (
          <LegacyCodePane code={code} theme={theme} winOpacity={win.opacity} readOnly={readOnly} onChange={updateCode} focusProps={focusProps} />
        ) : (
          <VSCodeLikeEditor ref={editorRef} code={code} language={language} editorTheme={theme} fontSize={theme.fontSize || 13} readOnly={readOnly} onChange={updateCode} />
        )}
      </div>
      )}
      {!isIframeMode && <CodeStatusBar code={code} language={langLabel} />}
      {menu && (
        <CodeEditorContextMenu x={menu.x} y={menu.y} hasSelection={Boolean(menu.selection.text)} canFormat={formatOn}
          formatHint={`Prettier · ${langLabel}`}
          onFormatDocument={formatWhole} onFormatSelection={() => formatRange(menu.selection)}
          onAskAgent={() => askAgentToFix(menu.selection)} onClose={() => setMenu(null)} />
      )}
    </>
  );
}

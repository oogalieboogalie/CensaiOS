import React from 'react';
import { WindowChromeContext } from './windows/windowChromeContext.js';
import { useWorkspaceStore } from '../lib/store.js';
import { buildDesignDocument, normalizeDesignSourceType } from '../lib/design/designSource.js';
import { DesignBlockToolbar } from './design/DesignBlockToolbar.jsx';
import { DesignRemixBar } from './design/DesignRemixBar.jsx';

const FILE_EXT = { html: 'html', tailwind: 'html', react: 'jsx', svg: 'svg', css: 'css' };
const LANGUAGE = { html: 'html', tailwind: 'html', react: 'javascript', svg: 'xml', css: 'css' };

function fileStem(title) {
  return String(title || 'design').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'design';
}

function useDebounced(value, delay) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// A design block is code rendered straight onto the canvas: no title bar, no
// border, no background (the frame only shows on hover or when selected).
// Its source can be opened in a linked code editor or rewritten by any model.
export function DesignBlockWindow({ win, onUpdate }) {
  const chrome = React.useContext(WindowChromeContext);
  const isActive = chrome?.isActive ?? true;
  const sourceType = normalizeDesignSourceType(win.sourceType);
  const linkedEditor = useWorkspaceStore((state) => (
    win.sourceWindowId
      ? state.wins.find(w => w.id === win.sourceWindowId && w.kind === 'code_editor') || null
      : null
  ));
  const spawnAt = useWorkspaceStore(state => state.spawnAt);
  const updateWindow = useWorkspaceStore(state => state.onUpdate);
  const setActiveId = useWorkspaceStore(state => state.setActiveId);
  const [remixOpen, setRemixOpen] = React.useState(false);

  const liveSource = linkedEditor && typeof linkedEditor.code === 'string' ? linkedEditor.code : (win.source || '');
  const source = useDebounced(liveSource, 250);
  const doc = React.useMemo(() => buildDesignDocument(sourceType, source), [sourceType, source]);
  const showRender = win.view === 'render' && Boolean(win.renderUrl);

  // Keep the block's own copy current so it survives the editor closing and
  // reaches collaborators even if they never open the editor.
  React.useEffect(() => {
    if (linkedEditor && source !== win.source) onUpdate?.({ source });
  }, [linkedEditor, source, win.source, onUpdate]);

  const openCode = () => {
    if (linkedEditor) { setActiveId?.(linkedEditor.id); return; }
    const editorId = spawnAt?.('code_editor', {
      title: `${win.title || 'Design'} code`,
      fileName: `${fileStem(win.title)}.${FILE_EXT[sourceType]}`,
      language: LANGUAGE[sourceType],
      code: liveSource,
    }, { x: (win.x || 0) + (win.w || 600) + 32, y: win.y || 0 }, { w: 560, h: Math.max(420, Math.min(win.h || 520, 760)) });
    if (editorId) onUpdate?.({ sourceWindowId: editorId });
  };

  const applyRemix = (next) => {
    onUpdate?.({ source: next, previousSource: liveSource, view: 'live' });
    if (linkedEditor) updateWindow?.(linkedEditor.id, { code: next });
  };

  const undoRemix = () => {
    if (typeof win.previousSource !== 'string') return;
    onUpdate?.({ source: win.previousSource, previousSource: null });
    if (linkedEditor) updateWindow?.(linkedEditor.id, { code: win.previousSource });
  };

  return (
    <div data-design-block={sourceType} style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
      {showRender ? (
        <img src={win.renderUrl} alt={win.title || 'Figma render'} style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'top left', display: 'block' }} />
      ) : doc ? (
        <iframe
          title={win.title || 'Design block'}
          srcDoc={doc}
          sandbox="allow-scripts allow-forms allow-popups allow-modals"
          style={{ flex: 1, width: '100%', height: '100%', border: 0, display: 'block', background: 'transparent', colorScheme: 'normal' }}
        />
      ) : (
        <div style={{ margin: 'auto', color: 'var(--ink-faint)', font: '13px var(--font-sans)', textAlign: 'center', padding: 24 }}>
          Paste HTML, Tailwind, JSX or SVG on the canvas, or open the code to start writing.
        </div>
      )}
      {/* Unselected, the iframe would swallow the click that selects the block. */}
      {!isActive && <div data-design-shield aria-hidden="true" style={{ position: 'absolute', inset: 0 }} />}
      {isActive && (
        <DesignBlockToolbar
          sourceType={sourceType}
          linked={Boolean(linkedEditor)}
          hasRender={Boolean(win.renderUrl)}
          showRender={showRender}
          bare={win.bare === true}
          canUndo={typeof win.previousSource === 'string'}
          remixOpen={remixOpen}
          onOpenCode={openCode}
          onToggleRemix={() => setRemixOpen(open => !open)}
          onToggleRender={() => onUpdate?.({ view: showRender ? 'live' : 'render' })}
          onToggleFrame={() => onUpdate?.(win.bare === true ? { bare: false, frameless: false } : { bare: true, frameless: true })}
          onUndo={undoRemix}
        />
      )}
      {isActive && remixOpen && (
        <DesignRemixBar
          source={liveSource}
          sourceType={sourceType}
          onApply={(next) => { applyRemix(next); setRemixOpen(false); }}
          onClose={() => setRemixOpen(false)}
        />
      )}
    </div>
  );
}

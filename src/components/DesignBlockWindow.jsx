import React from 'react';
import { WindowChromeContext } from './windows/windowChromeContext.js';
import { useWorkspaceStore } from '../lib/store.js';
import { buildDesignDocument, normalizeDesignSourceType } from '../lib/design/designSource.js';
import { DesignBlockToolbar } from './design/DesignBlockToolbar.jsx';
import { DesignBlockEmpty } from './design/DesignBlockEmpty.jsx';
import { DesignRemixBar } from './design/DesignRemixBar.jsx';
import { useFigmaResync } from './design/useFigmaResync.js';

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
// border, and no paint behind the design (the frame only shows on hover or
// when selected). An empty block shows a well and a card instead. Its source
// can be opened in a linked code editor or rewritten by any model.
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

  const resync = useFigmaResync({
    win,
    liveSource,
    onUpdate,
    onSourceChange: (next) => { if (linkedEditor) updateWindow?.(linkedEditor.id, { code: next }); },
  });

  const [copied, setCopied] = React.useState(false);
  const copyCode = () => {
    Promise.resolve(navigator.clipboard?.writeText(liveSource))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })
      .catch(() => {});
  };

  const undoRemix = () => {
    if (typeof win.previousSource !== 'string') return;
    onUpdate?.({ source: win.previousSource, previousSource: null });
    if (linkedEditor) updateWindow?.(linkedEditor.id, { code: win.previousSource });
  };

  const empty = !showRender && !doc;

  return (
    <div data-design-block={sourceType} data-empty={empty ? 'true' : 'false'} className="hb-db">
      {showRender ? (
        <img className="hb-db-render" src={win.renderUrl} alt={win.title || 'Figma render'} />
      ) : doc ? (
        <iframe
          className="hb-db-frame"
          title={win.title || 'Design block'}
          srcDoc={doc}
          sandbox="allow-scripts allow-forms allow-popups allow-modals"
        />
      ) : (
        <DesignBlockEmpty onOpenCode={openCode} />
      )}
      {/* Unselected, the iframe would swallow the click that selects the block. */}
      {!isActive && <div data-design-shield className="hb-db-shield" aria-hidden="true" />}
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
          onCopy={copyCode}
          copied={copied}
          figmaSync={resync.canSync ? { busy: resync.busy, onSync: resync.sync } : null}
        />
      )}
      {isActive && resync.error && (
        <div role="alert" className="hb-panel hb-db-alert">{resync.error}</div>
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

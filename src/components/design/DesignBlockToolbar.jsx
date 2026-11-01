const TYPE_LABEL = { html: 'HTML', tailwind: 'Tailwind', react: 'React', svg: 'SVG', css: 'CSS' };

function ToolButton({ active, onClick, title, children }) {
  return (
    <button
      type="button"
      title={title}
      className="hb-db-btn hb-press"
      data-active={active ? 'true' : undefined}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </button>
  );
}

// Floating pill on a selected design block, Figma-style, so the design stays
// borderless. Every control answers the pointer.
export function DesignBlockToolbar({
  sourceType, linked, hasRender, showRender, bare, canUndo, remixOpen,
  onOpenCode, onToggleRemix, onToggleRender, onToggleFrame, onUndo, onCopy, copied, figmaSync,
}) {
  return (
    <div role="toolbar" aria-label="Design block tools" className="hb-db-bar hb-bar">
      <span className="hb-db-kind">{TYPE_LABEL[sourceType] || 'Code'}</span>
      <ToolButton active={linked} onClick={onOpenCode} title={linked ? 'Jump to the linked code editor' : 'Open this block in a live-linked code editor'}>
        Code
      </ToolButton>
      {onCopy && (
        <ToolButton onClick={onCopy} title="Copy this block's code to paste into any other tool or model">
          {copied ? 'Copied' : 'Copy code'}
        </ToolButton>
      )}
      <ToolButton active={remixOpen} onClick={onToggleRemix} title="Ask any model to change this design">
        Remix with AI
      </ToolButton>
      {hasRender && (
        <ToolButton active={showRender} onClick={onToggleRender} title="Compare the live code with Figma's own render">
          {showRender ? 'Figma render' : 'Live code'}
        </ToolButton>
      )}
      {figmaSync && (
        <ToolButton onClick={figmaSync.onSync} title="Pull this frame from Figma again (Undo brings back your edits)">
          {figmaSync.busy ? 'Syncing…' : 'Sync from Figma'}
        </ToolButton>
      )}
      {canUndo && <ToolButton onClick={onUndo} title="Restore the code from before the last remix">Undo</ToolButton>}
      <ToolButton active={!bare} onClick={onToggleFrame} title={bare ? 'Show a window frame around this block' : 'Make this block borderless'}>
        {bare ? 'Borderless' : 'Framed'}
      </ToolButton>
    </div>
  );
}

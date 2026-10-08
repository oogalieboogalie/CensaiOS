import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import { attachToChat, chatTargets, newChatWithSketch } from '../../lib/ink/sketchActions.js';
import { copyPngToClipboard } from '../../lib/ink/rasterize.js';

// Spec 9: the floating bar for a sketch, on canvas ink selections and on the
// Sketchpad. Text buttons, one accent (Make real), no icons to decode.

const bar = {
  display: 'flex', alignItems: 'center', gap: 'var(--space-0-5)', padding: 'var(--space-1)',
  background: 'var(--surface-raised)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)',
  boxShadow: 'var(--elevation-2)', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap',
};
const btn = {
  all: 'unset', cursor: 'pointer', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)',
  color: 'var(--ink-soft)', lineHeight: 1.4,
};
const primary = { ...btn, background: 'var(--accent)', color: 'var(--accent-contrast)' };
const divider = { width: 1, alignSelf: 'stretch', background: 'var(--hairline)', margin: '0 var(--space-0-5)' };
const menu = {
  position: 'absolute', top: '100%', left: 0, marginTop: 'var(--space-1)', minWidth: 220, padding: 'var(--space-1)',
  background: 'var(--surface-raised)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)',
  boxShadow: 'var(--elevation-2)', display: 'flex', flexDirection: 'column', gap: 'var(--space-px)', zIndex: 5,
};

function hover(e, on) {
  if (e.currentTarget.dataset.primary) return;
  e.currentTarget.style.background = on ? 'var(--surface-hover)' : 'transparent';
}

function Button({ children, onClick, isPrimary = false, disabled = false, title, ...rest }) {
  return (
    <button
      type="button" title={title} disabled={disabled} data-primary={isPrimary ? 'true' : undefined}
      style={{ ...(isPrimary ? primary : btn), ...(disabled ? { opacity: 0.45, cursor: 'default' } : null) }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseEnter={(e) => hover(e, true)} onMouseLeave={(e) => hover(e, false)}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onClick?.(); }}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * getImage(): Promise<{ dataUrl, bounds } | null> — the sketch as a PNG.
 * onMakeReal, onCleanUp, onSendToSketchpad, onDelete are optional.
 */
export function SketchActionBar({ getImage, onMakeReal, onCleanUp, onSendToSketchpad, onDelete, label = null, menuAbove = false }) {
  const wins = useWorkspaceStore((s) => s.wins);
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState(null);
  const targets = React.useMemo(() => (open ? chatTargets(wins) : []), [open, wins]);

  React.useEffect(() => {
    if (!note) return undefined;
    const t = setTimeout(() => setNote(null), 2400);
    return () => clearTimeout(t);
  }, [note]);

  const withImage = async (fn) => {
    const image = await getImage();
    if (!image) { setNote('Nothing to send yet'); return; }
    fn(image);
  };

  const copy = () => withImage(async ({ dataUrl }) => {
    setNote(await copyPngToClipboard(dataUrl) ? 'Copied as image' : 'This browser blocked the clipboard');
  });

  return (
    <div data-sketch-actions data-canvas-ui style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <div style={bar}>
        {label && <span style={{ padding: '0 var(--space-2)', color: 'var(--ink-faint)', fontVariantNumeric: 'tabular-nums' }}>{label}</span>}
        <div style={{ position: 'relative' }}>
          <Button onClick={() => setOpen((o) => !o)} aria-expanded={open}>Ask an agent</Button>
          {open && (
            <div style={menuAbove ? { ...menu, top: 'auto', bottom: '100%', marginTop: 0, marginBottom: 'var(--space-1)' } : menu} role="menu">
              {targets.map((t) => (
                <Button
                  key={t.id} role="menuitem" disabled={!t.canSee}
                  title={t.canSee ? `Attach to ${t.title}` : `${t.agentName}'s model can't read images`}
                  onClick={() => withImage(({ dataUrl }) => { attachToChat(t.id, dataUrl); setOpen(false); setNote(`Attached to ${t.title}`); })}
                >
                  <span style={{ color: 'var(--ink)' }}>{t.title}</span>
                  <span style={{ marginLeft: 'var(--space-2)', color: 'var(--ink-faint)' }}>{t.canSee ? t.agentName : 'no image input'}</span>
                </Button>
              ))}
              {targets.length > 0 && <div style={{ height: 1, background: 'var(--hairline)', margin: 'var(--space-1) 0' }} />}
              <Button role="menuitem" onClick={() => withImage(({ dataUrl, bounds }) => { newChatWithSketch(dataUrl, bounds); setOpen(false); })}>
                New chat with this sketch
              </Button>
            </div>
          )}
        </div>
        {onMakeReal && <Button isPrimary onClick={onMakeReal} title="Build a working module from this sketch">Make real</Button>}
        {onCleanUp && <Button onClick={() => setNote(onCleanUp() ? 'Shapes cleaned up' : 'No clear shapes found')}>Clean up</Button>}
        <Button onClick={copy}>Copy image</Button>
        {onSendToSketchpad && <Button onClick={onSendToSketchpad}>To Sketchpad</Button>}
        {onDelete && <><span style={divider} /><Button onClick={onDelete} title="Delete the selected strokes">Delete</Button></>}
      </div>
      {note && <div role="status" style={{ marginTop: 'var(--space-1)', padding: 'var(--space-0-5) var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', background: 'var(--surface-raised)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)' }}>{note}</div>}
    </div>
  );
}

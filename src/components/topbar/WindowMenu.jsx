import React from 'react';
import { AddPalette } from './AddPalette.jsx';

// The toolbar's Add button (spec 6). It and Ctrl+K open one Add palette:
// every module, My modules, templates, and "Make a new module". The old
// dropdown and the Browse Modules list both live there now; turning modules
// on or off moved to Settings > Modules.
export function WindowMenu({ onSpawn }) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('censai:open-add-palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('censai:open-add-palette', onOpen);
    };
  }, []);

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        data-mission="module-menu"
        title="Add a module (Ctrl+K)"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(o => !o)}
        style={{ all: 'unset', cursor: 'pointer', padding: '4px 10px', borderRadius: 'var(--radius-float-btn)', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-soft)', background: open ? 'var(--surface-2)' : 'transparent' }}
      >
        <img src="/assets/logolite.png" alt="" style={{ height: 28, width: 'auto', objectFit: 'contain', borderRadius: 'var(--radius-float-sm)' }} />
        Add
        <span className="hb-kbd" aria-hidden="true">Ctrl K</span>
      </button>
      <AddPalette open={open} onClose={() => setOpen(false)} onSpawn={onSpawn} />
    </div>
  );
}

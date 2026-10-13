import React from 'react';
import { broadcastToolChange, isEditingTarget } from '../toolbarDefs.jsx';
import { DockChatPopup } from './DockChatPopup.jsx';

// Chat entry in the multi-tool dock: owns its open state, renders the dock
// button through the provided renderer, and pops the pick-agent messenger
// above the dock. C toggles (ignored while typing); the dock bar itself
// never treats chat as an active tool.
export function DockChat({ renderButton }) {
  const [open, setOpen] = React.useState(false);

  const toggle = React.useCallback(() => {
    broadcastToolChange('chat');
    setOpen((o) => !o);
  }, []);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isEditingTarget(e.target)) return;
      if (e.key.toLowerCase() !== 'c') return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  return (
    <>
      {renderButton(toggle)}
      {open && <DockChatPopup onClose={() => setOpen(false)} />}
    </>
  );
}

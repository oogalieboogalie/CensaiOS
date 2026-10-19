import React from 'react';
import { broadcastToolChange, isEditingTarget } from '../toolbarDefs.jsx';
import { toggleCensaiChat } from '../../components/censai/usePinnedChat.js';

// Chat entry in the multi-tool dock: opens or shrinks Censai's pinned chat
// (bottom-right corner, above every window). C toggles it too (ignored
// while typing); the dock bar itself never treats chat as an active tool.
export function DockChat({ renderButton }) {
  const toggle = React.useCallback(() => {
    broadcastToolChange('chat');
    toggleCensaiChat();
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

  return renderButton(toggle);
}

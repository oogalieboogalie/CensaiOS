import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import { hotkeyFolder } from '../../lib/windowProject.js';
import {
  AGENT_HOTKEYS_CHANGED,
  actionForEvent,
  loadAgentHotkeys,
} from '../../lib/agentHotkeys.js';

// Alt+letter opens a terminal straight into a coding CLI (src/lib/agentHotkeys.js).
// Listens in the capture phase so the keys also work while a terminal, an
// editor or a chat box has the keyboard (xterm swallows keys before they
// bubble). Only a key that is bound is taken; every other Alt key passes on.
export function useAgentHotkeys(spawnAt) {
  const mapRef = React.useRef(loadAgentHotkeys());

  React.useEffect(() => {
    const reload = () => { mapRef.current = loadAgentHotkeys(); };
    window.addEventListener(AGENT_HOTKEYS_CHANGED, reload);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener(AGENT_HOTKEYS_CHANGED, reload);
      window.removeEventListener('storage', reload);
    };
  }, []);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.repeat || e.defaultPrevented) return;
      // Settings → Hotkeys is recording a new key: let it have this one.
      if (e.target?.closest?.('[data-hotkey-recorder]')) return;
      const action = actionForEvent(mapRef.current, e);
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      const cwd = hotkeyFolder(useWorkspaceStore.getState());
      spawnAt('terminal', { title: action.label, cwd, ...(action.cli ? { launchCli: action.cli } : {}) });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [spawnAt]);
}

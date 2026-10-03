import React from 'react';
import { PresenceToasts } from '../components/PresenceToasts.jsx';
import { FirstMission } from '../components/onboarding/FirstMission.jsx';

// Note: the live presence pill used to render here. It now lives inside the
// middle multi-tool dock (DockPresence in Toolbar.jsx), so Hud only owns
// toasts + onboarding.
export function Hud({ focusMode, collaboration }) {
  return (<>
    {!focusMode && <PresenceToasts collaboration={collaboration} />}
    <FirstMission focusMode={focusMode} />
  </>);
}

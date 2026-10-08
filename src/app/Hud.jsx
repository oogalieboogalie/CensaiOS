import React from 'react';
import { PresenceToasts } from '../components/PresenceToasts.jsx';
import { FirstMission } from '../components/onboarding/FirstMission.jsx';
import { publishPresence } from '../lib/modules/presenceRoster.js';

// Note: the live presence pill used to render here. It now lives inside the
// middle multi-tool dock (DockPresence in Toolbar.jsx), so Hud only owns
// toasts + onboarding. It also hands the roster to modules (censai.presence).
export function Hud({ focusMode, collaboration }) {
  const participants = collaboration?.participants;
  React.useEffect(() => { publishPresence(participants); }, [participants]);
  return (<>
    {!focusMode && <PresenceToasts collaboration={collaboration} />}
    <FirstMission focusMode={focusMode} />
  </>);
}

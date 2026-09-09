import React from 'react';
import { CollaborationPresence } from '../components/CollaborationPresence.jsx';
import { PresenceToasts } from '../components/PresenceToasts.jsx';
import { FirstMission } from '../components/onboarding/FirstMission.jsx';

export function Hud({ focusMode, collaboration, onShare }) {
  return (<>
    <CollaborationPresence collaboration={collaboration} focusMode={focusMode} onShare={onShare} />
    {!focusMode && <PresenceToasts collaboration={collaboration} />}
    <FirstMission focusMode={focusMode} />
  </>);
}

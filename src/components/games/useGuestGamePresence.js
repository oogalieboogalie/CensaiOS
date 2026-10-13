import React from 'react';
import { publishPresence, publishSelf } from '../../lib/modules/presenceRoster.js';
import { setLivePresenceSenders } from '../../lib/collaboration/liveText.js';

/**
 * Games on a guest's board (spec 11) need who is here, whether this link may
 * play (edit links play, view and comment links watch) and a way to send keys.
 */
export function useGuestGamePresence(collaboration, canEdit) {
  React.useEffect(() => { publishPresence(collaboration.participants); }, [collaboration.participants]);
  React.useEffect(() => { publishSelf(collaboration.self, { canEdit }); }, [collaboration.self, canEdit]);
  React.useEffect(() => { setLivePresenceSenders({ sendGame: canEdit ? collaboration.send : null }); }, [canEdit, collaboration.send]);
}

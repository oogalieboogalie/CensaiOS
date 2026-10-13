/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import { useBoardEvent } from '../../lib/collaboration/boardEvents.js';
import { followCamera } from '../../lib/guest/guestIdentity.js';
import { followTarget } from '../../lib/workspace/shareLink.js';

/**
 * Follow mode on the instructor's side (spec 12): a student's board opened
 * from the classroom grid (`?follow=<guestId>`) tracks that student's view.
 * Panning or zooming yourself takes over; "Follow" picks them up again.
 */
export function FollowStudent() {
  const [target] = React.useState(() => followTarget());
  const [following, setFollowing] = React.useState(Boolean(target));
  const [name, setName] = React.useState('');
  const applied = React.useRef(null);
  const last = React.useRef(null);
  const applying = React.useRef(false);

  const apply = React.useCallback((camera) => {
    const next = followCamera(camera, { width: window.innerWidth, height: window.innerHeight });
    applied.current = next;
    const store = useWorkspaceStore.getState();
    applying.current = true;
    store.setPan(next.pan);
    store.setZoom(next.zoom);
    applying.current = false;
  }, []);

  useBoardEvent('camera', (message) => {
    if (!target || message.actor?.id !== target) return;
    last.current = message;
    setName(message.actor?.label || 'Student');
    if (following) apply(message);
  });

  // Any view change we didn't make is the instructor taking over.
  React.useEffect(() => {
    if (!target || !following) return undefined;
    return useWorkspaceStore.subscribe((state) => {
      const ours = applied.current;
      if (!ours || applying.current) return;
      const moved = Math.abs(state.pan.x - ours.pan.x) > 1 || Math.abs(state.pan.y - ours.pan.y) > 1
        || Math.abs(state.zoom - ours.zoom) > 0.001;
      if (moved) setFollowing(false);
    });
  }, [target, following]);

  if (!target) return null;
  return (
    <div className="hb-follow-chip" data-testid="follow-student" data-following={following ? 'true' : 'false'}>
      <span>{following ? `Following ${name || 'student'}` : `You have the view${name ? ` · ${name} is here` : ''}`}</span>
      {following
        ? <button type="button" className="hb-btn" onClick={() => setFollowing(false)}>Take over</button>
        : <button type="button" className="hb-btn" data-primary="true" onClick={() => { setFollowing(true); if (last.current) apply(last.current); }}>Follow</button>}
    </div>
  );
}

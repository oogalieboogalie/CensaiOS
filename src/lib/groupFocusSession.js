import { logGroupFocusChange, outsideFocusCount } from './groupHotkeys.js';

function countOutside(state, groupId) {
  return outsideFocusCount(state.wins, state.canvasGroups, groupId);
}

/**
 * Next store slice for full-screen group focus. A repeat for the same group
 * and F key (a resize) only updates the view — it does not log again.
 */
export function enterGroupFocusState(state, groupId, view) {
  const prev = state.groupFocus;
  const slot = view?.slot ?? null;
  const same = Boolean(prev) && prev.groupId === groupId && (prev.slot ?? null) === slot;
  if (!same) {
    if (prev) {
      logGroupFocusChange({
        action: 'ended',
        slot: prev.slot,
        outsideCount: countOutside(state, prev.groupId),
      });
    }
    logGroupFocusChange({
      action: 'started',
      slot,
      outsideCount: countOutside(state, groupId),
    });
  }
  return {
    groupFocus: {
      groupId,
      slot,
      prevPan: prev?.prevPan ?? state.pan,
      prevZoom: prev?.prevZoom ?? state.zoom,
    },
    pan: view.pan,
    zoom: view.zoom,
  };
}

/** Next store slice for leaving full screen, or null when it is already off. */
export function leaveGroupFocusState(state, kind) {
  const focus = state.groupFocus;
  if (!focus) return null;
  logGroupFocusChange({
    action: 'ended',
    slot: focus.slot,
    outsideCount: countOutside(state, focus.groupId),
    kind: typeof kind === 'string' ? kind : undefined,
  });
  return { groupFocus: null, pan: focus.prevPan, zoom: focus.prevZoom };
}

/** End full screen before a new window is added so that window shows up. */
export function releaseGroupFocusForNewWindow(get, kind) {
  if (!get().groupFocus) return false;
  const label = typeof kind === 'string' && kind ? kind : 'window';
  return get().exitGroupFocus(label);
}

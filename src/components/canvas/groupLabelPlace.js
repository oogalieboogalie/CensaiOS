import React from 'react';

// The board's top toolbars (Chrome.jsx) sit fixed at the top of the screen
// and take the click there. A group label floating above a group closer than
// this to the top would sit under them, so it moves inside the group's top
// edge instead.
export const TOP_BAR_ROOM = 52;
const LABEL_HEIGHT = 28;
const GAP = 6;

/**
 * True when a label above a group whose top is at `groupTop` (screen px) would
 * reach under the top toolbars. The label is drawn at screen size whatever the
 * zoom, so its height is fixed.
 */
export function labelWouldHide(groupTop) {
  return groupTop - (LABEL_HEIGHT + GAP) < TOP_BAR_ROOM;
}

/** Where the label (and the F-key chip) sits: just above the group, or just inside its top edge. */
export function labelPlace(inside, zoom) {
  return inside
    ? { top: 0, bottom: 'auto', transform: `translateY(${GAP}px) scale(${1 / zoom})`, transformOrigin: 'top left' }
    : { bottom: '100%', transform: `translateY(-${GAP}px) scale(${1 / zoom})`, transformOrigin: 'bottom left' };
}

/** Measures the group on screen while its label shows and says whether the label belongs inside. */
export function useLabelInside(groupRef, active) {
  const [inside, setInside] = React.useState(false);
  React.useLayoutEffect(() => {
    if (!active || !groupRef.current) return;
    setInside(labelWouldHide(groupRef.current.getBoundingClientRect().top));
  });
  return inside;
}

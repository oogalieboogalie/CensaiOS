// Things fixed on the screen, like the Board map, that a new window should
// open clear of. Each one says where it sits (screen px) while it is shown and
// drops out when it is gone; findFreeSpot keeps new windows clear of them when
// there is room.

const spots = new Map();

const finite = (r) => r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0;

export function setScreenFurniture(id, rect) {
  if (finite(rect)) spots.set(id, { x: rect.x, y: rect.y, w: rect.w, h: rect.h });
  else spots.delete(id);
}

export function screenFurniture() {
  return [...spots.values()];
}

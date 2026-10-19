// Which windows travel with a group when its frame is dragged.
//
// A tiled group (one with a layout tree) carries exactly its tiles. A loose
// window that happens to sit under the group is left behind: pulling it in
// without a tile used to break the group (every window got its own resize
// corners back and the layout stopped fitting; see tiledMembers in
// dockZones.js). A group without a layout keeps the older rule: anything
// assigned to it or whose center sits inside it comes along.
import { treeWindowIds } from './tree.js';

function centerInside(w, g) {
  const cx = w.x + w.w / 2;
  const cy = w.y + w.h / 2;
  return cx >= g.x && cx <= g.x + g.w && cy >= g.y && cy <= g.y + g.h;
}

/** @returns {{ carry: object[], leftBehind: object[], pickedUp: object[] }} */
export function groupDragMembers(group, wins) {
  if (group?.root) {
    const tiles = new Set(treeWindowIds(group.root));
    const carry = wins.filter((w) => tiles.has(w.id));
    const leftBehind = wins.filter((w) => !tiles.has(w.id) && !w.pinned
      && (w.groupId === group.id || centerInside(w, group)));
    return { carry, leftBehind, pickedUp: [] };
  }
  const carry = wins.filter((w) => w.groupId === group.id || (!w.pinned && centerInside(w, group)));
  return { carry, leftBehind: [], pickedUp: carry.filter((w) => w.groupId !== group.id) };
}

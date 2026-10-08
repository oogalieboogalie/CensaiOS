// Drop targets: what is under the pointer while a window is dragged.
import {
  EDGE_BAND_PX, LOOSE_EDGE_BAND_PX, LAYOUT_BAR, zonePresetsFor, tiledMembers, tileIndex, unionRect, rectOf, inside,
} from './dockZones.js';

const CENTER_LO = 0.3;
const CENTER_HI = 0.7;

export function layoutBarGeometry(host, count, zoom = 1) {
  const presets = zonePresetsFor(count);
  if (!presets.length) return null;
  const s = 1 / (zoom || 1);
  const { cellW, cellH, pad, gap, top } = LAYOUT_BAR;
  const w = (presets.length * cellW + (presets.length - 1) * gap + pad * 2) * s;
  const h = (cellH + pad * 2) * s;
  const bar = { x: host.x + host.w / 2 - w / 2, y: host.y + top * s, w, h };
  const items = presets.map((preset, i) => {
    const box = { x: bar.x + (pad + i * (cellW + gap)) * s, y: bar.y + pad * s, w: cellW * s, h: cellH * s };
    return {
      preset,
      box,
      cells: preset.cells.map(([cx, cy, cw, ch]) => ({ x: box.x + cx * box.w, y: box.y + cy * box.h, w: cw * box.w, h: ch * box.h })),
    };
  });
  return { bar, items };
}

function sideFor(point, rect) {
  const u = (point.x - rect.x) / Math.max(1, rect.w);
  const v = (point.y - rect.y) / Math.max(1, rect.h);
  const distances = { left: u, right: 1 - u, top: v, bottom: 1 - v };
  return { u, v, side: Object.entries(distances).sort((a, b) => a[1] - b[1])[0][0] };
}

/**
 * Where a dragged window would dock, given the pointer in canvas units.
 * Returns null when it would just move freely.
 *   { kind: 'tile', targetId, groupId|null, side }   side: left|right|top|bottom|center
 *   { kind: 'edge', groupId, side }                   along the group's outer edge
 *   { kind: 'preset', groupId|null, hostId|null, presetId, cell }
 */
export function resolveDockTarget({ point, draggedId, wins = [], canvasGroups = [], zoom = 1, previous = null }) {
  if (!point) return null;
  const s = 1 / (zoom || 1);
  const { hidden } = tileIndex(wins, canvasGroups);
  const dragged = wins.find((w) => w.id === draggedId);

  // Hosts: tiled groups first (one target for the whole group), then loose windows.
  const hosts = [];
  for (const group of canvasGroups) {
    const members = tiledMembers(group, wins)?.filter((w) => w.id !== draggedId);
    if (!members?.length) continue;
    hosts.push({ kind: 'group', group, members, rect: unionRect(members.map(rectOf)) });
  }
  for (const w of wins) {
    if (w.id === draggedId || hidden.has(w.id) || w.pinned || w.maximized) continue;
    if (hosts.some((h) => h.kind === 'group' && h.members.some((m) => m.id === w.id))) continue;
    if (w.groupId && w.groupId === dragged?.groupId) continue;
    hosts.push({ kind: 'window', win: w, rect: rectOf(w) });
  }

  // Keep the layout bar of the last host reachable while the pointer is on it.
  const barHit = (host) => {
    const count = host.kind === 'group' ? host.members.length + 1 : 2;
    const geo = layoutBarGeometry(host.rect, count, zoom);
    if (!geo || !inside(point, geo.bar)) return null;
    for (const item of geo.items) {
      const cell = item.cells.findIndex((c) => inside(point, c));
      if (cell >= 0) {
        return {
          kind: 'preset',
          presetId: item.preset.id,
          cell,
          groupId: host.kind === 'group' ? host.group.id : null,
          hostId: host.kind === 'window' ? host.win.id : null,
        };
      }
    }
    return { kind: 'bar', groupId: host.kind === 'group' ? host.group.id : null, hostId: host.kind === 'window' ? host.win.id : null };
  };

  const ordered = previous
    ? [...hosts].sort((a, b) => Number(hostMatches(b, previous)) - Number(hostMatches(a, previous)))
    : hosts;
  for (const host of ordered) {
    if (!inside(point, host.rect)) continue;
    const bar = barHit(host);
    if (bar) return bar;
    if (host.kind === 'group') {
      const band = EDGE_BAND_PX * s;
      const r = host.rect;
      const edges = { left: point.x - r.x, right: r.x + r.w - point.x, top: point.y - r.y, bottom: r.y + r.h - point.y };
      const [edgeSide, edgeDist] = Object.entries(edges).sort((a, b) => a[1] - b[1])[0];
      if (edgeDist <= band && host.members.length > 1) return { kind: 'edge', groupId: host.group.id, side: edgeSide };
      const tile = host.members.find((m) => !hidden.has(m.id) && inside(point, rectOf(m)));
      if (!tile) return { kind: 'edge', groupId: host.group.id, side: edgeSide };
      const { u, v, side } = sideFor(point, rectOf(tile));
      const center = u > CENTER_LO && u < CENTER_HI && v > CENTER_LO && v < CENTER_HI;
      return { kind: 'tile', targetId: tile.id, groupId: host.group.id, side: center ? 'center' : side };
    }
    // Loose window: only its outer band docks, so windows can still overlap freely.
    const band = LOOSE_EDGE_BAND_PX * s;
    const r = host.rect;
    const edges = { left: point.x - r.x, right: r.x + r.w - point.x, top: point.y - r.y, bottom: r.y + r.h - point.y };
    const [side, dist] = Object.entries(edges).sort((a, b) => a[1] - b[1])[0];
    if (dist <= band) return { kind: 'tile', targetId: host.win.id, groupId: null, side };
    return { kind: 'bar-hint', hostId: host.win.id, groupId: null };
  }
  return null;
}

function hostMatches(host, target) {
  if (!target) return false;
  if (host.kind === 'group') return target.groupId === host.group.id;
  return target.hostId === host.win.id || target.targetId === host.win.id;
}

/** True for targets that change the layout on drop (bars and hints don't). */
export function isDockAction(target) {
  return !!target && (target.kind === 'tile' || target.kind === 'edge' || target.kind === 'preset');
}


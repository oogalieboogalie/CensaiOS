import React from 'react';
import { cleanLayout, applyPreset, fitGroupToLayout, getGroupInnerBounds } from '../../lib/layoutAlgo.js';
import { CanvasGroup, CanvasGroupCard } from './CanvasGroup.jsx';
import { windowsInGroup } from '../../lib/layout/groupResize.js';
import { tiledMembers } from '../../lib/layout/dock.js';

/** Shadows under tiled groups. Drawn below the windows. */
export function CanvasGroupCards({ groups, wins }) {
  return groups.filter((g) => tiledMembers(g, wins)).map((g) => <CanvasGroupCard key={g.id} group={g} />);
}

/** Group chrome (labels, seams, tabs). Drawn above the windows. */
export function CanvasGroupsLayer({
  groups,
  wins,
  zoom,
  onUpdate,
  onUpdateGroup,
  onResizeGroup,
  onCloseGroup,
  onMoveGroup,
  onGroupDragEnd,
  onAutoArrangeGroup,
  onSaveGroupPreset,
  onLoadGroupPreset,
  onDeleteGroupPreset,
  onSetDefaultGroupPreset,
  onSetGroupSeam,
  onShowGroupTab,
  onUndockTab,
  visibleGroupIds = null,
  groupHotkeySlotById = {},
}) {
  return groups.map(g => (
    <CanvasGroup
      key={g.id}
      group={g}
      zoom={zoom}
      allWins={wins}
      allGroups={groups}
      tiled={!!tiledMembers(g, wins)}
      visible={visibleGroupIds ? visibleGroupIds.has(g.id) : true}
      onUpdate={(patch) => onUpdateGroup(g.id, patch)}
      onClose={() => onCloseGroup(g.id)}
      onMove={(dx, dy, isFirstMove) => onMoveGroup(g.id, dx, dy, isFirstMove)}
      onDragEnd={() => onGroupDragEnd(g.id)}
      onLayout={() => onAutoArrangeGroup?.(g.id)}
      onResize={(updates) => {
        if (onResizeGroup) {
          onResizeGroup(g.id, updates);
          return;
        }
        updates.windowPatches.forEach((item) => onUpdate(item.id, item.patch));
        updates.groupPatches.forEach((item) => onUpdateGroup(item.id, item.patch));
        onUpdateGroup(g.id, updates.groupPatch);
      }}
      onApplyBuiltInPreset={(presetId) => {
        const inside = windowsInGroup(wins, g);
        if (inside.length === 0) return;
        const root = applyPreset(presetId, inside);
        if (root) {
          const fittedGroup = fitGroupToLayout(g, root);
          const updates = cleanLayout(root, getGroupInnerBounds(fittedGroup));
          updates.forEach(u => onUpdate(u.id, { ...u.patch, groupId: g.id }));
          onUpdateGroup(g.id, { ...fittedGroup, root, presetId });
        }
      }}
      onSavePreset={(name) => onSaveGroupPreset?.(g.id, name)}
      onLoadPreset={(presetId) => onLoadGroupPreset?.(g.id, presetId)}
      onDeletePreset={(presetId) => onDeleteGroupPreset?.(g.id, presetId)}
      onSetDefaultPreset={(presetId) => onSetDefaultGroupPreset?.(g.id, presetId)}
      onSetSeam={(path, ratio) => onSetGroupSeam?.(g.id, path, ratio)}
      onShowTab={(winId) => onShowGroupTab?.(g.id, winId)}
      onUndockTab={onUndockTab}
      hotkeySlot={groupHotkeySlotById[g.id] || null}
    />
  ));
}

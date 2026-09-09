import React from 'react';
import { cleanLayout, applyPreset, fitGroupToLayout, getGroupInnerBounds } from '../../lib/layoutAlgo.js';
import { CanvasGroup } from './CanvasGroup.jsx';

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
}) {
  return groups.map(g => (
    <CanvasGroup
      key={g.id}
      group={g}
      zoom={zoom}
      allWins={wins}
      allGroups={groups}
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
        const inside = wins.filter(w => {
          const cx = w.x + w.w / 2;
          const cy = w.y + w.h / 2;
          return cx >= g.x && cx <= g.x + g.w && cy >= g.y && cy <= g.y + g.h;
        });
        if (inside.length === 0) return;
        const root = applyPreset(presetId, inside);
        if (root) {
          const fittedGroup = fitGroupToLayout(g, root);
          const updates = cleanLayout(root, getGroupInnerBounds(fittedGroup));
          updates.forEach(u => onUpdate(u.id, u.patch));
          onUpdateGroup(g.id, { ...fittedGroup, root, presetId });
        }
      }}
      onSavePreset={(name) => onSaveGroupPreset?.(g.id, name)}
      onLoadPreset={(presetId) => onLoadGroupPreset?.(g.id, presetId)}
      onDeletePreset={(presetId) => onDeleteGroupPreset?.(g.id, presetId)}
    />
  ));
}

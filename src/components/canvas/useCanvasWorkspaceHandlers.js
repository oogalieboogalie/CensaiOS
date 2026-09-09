import React from 'react';
import { getOwningGroup } from '../../lib/layoutAlgo.js';
import { screenToCanvas } from '../../lib/canvasMath.js';
import { basenameFromPath, windowInsideGroup } from './CanvasInteractions.js';
import { useTheme } from '../Theme.jsx';
import { FIRST_MISSION_DRAG_EVENT } from '../../lib/firstMission.js';

export function useCanvasWorkspaceHandlers({
  ref,
  wins,
  canvasGroups,
  currentProject,
  pan,
  zoom,
  onUpdate,
  onSpawn,
  onAutoArrangeGroup,
  onUpdateGroup,
  onLinkCreate,
  setWireDrag,
}) {
  const themeContext = useTheme();
  const theme = themeContext?.theme || { groupSnapping: true };
  const handleAssign = React.useCallback((data) => {
    const item = {
      id: crypto.randomUUID(),
      text: data.text,
      done: false,
      assignee: data.assignee,
      quoted: data.quoted,
      source: data.source,
      createdAt: Date.now(),
    };
    const existing = wins.find(ww => ww.kind === 'todos');
    if (existing) onUpdate(existing.id, { items: [...(existing.items || []), item] });
    else onSpawn('todos', { items: [item] });
  }, [wins, onUpdate, onSpawn]);

  const handleDragEnd = (winId, finalPosition, interaction = {}) => {
    const original = wins.find(w => w.id === winId);
    const draggedWin = original && finalPosition ? { ...original, ...finalPosition } : original;
    if (!draggedWin) return;
    // Click (no pointer movement) must be a no-op: selecting / focusing a
    // window inside a group must never re-layout the group. The drag hook
    // reports moved:false when pointer never moved; also guard against
    // sub-pixel jitter so a click doesn't count as a drag.
    let displacement = 0;
    if (original && finalPosition
      && typeof finalPosition.x === 'number' && typeof finalPosition.y === 'number') {
      displacement = Math.hypot(finalPosition.x - original.x, finalPosition.y - original.y);
    }
    const didMove = interaction.moved === true && displacement > 2;
    const owner = getOwningGroup(draggedWin, canvasGroups, false);
    const nextGroupId = owner ? owner.id : null;
    if (nextGroupId !== (original.groupId || null) || didMove) {
      onUpdate(winId, { groupId: nextGroupId });
    }
    if (!didMove) return;
    if (interaction.moved) {
      window.dispatchEvent(new CustomEvent(FIRST_MISSION_DRAG_EVENT, {
        detail: { winId, position: finalPosition },
      }));
    }

    const dcx = draggedWin.x + draggedWin.w / 2;
    const dcy = draggedWin.y + draggedWin.h / 2;
    const group = canvasGroups.find(g => dcx >= g.x && dcx <= g.x + g.w && dcy >= g.y && dcy <= g.y + g.h);
    if (!group) return;

    // Only tidy when the window newly entered a group (or changed groups).
    // Re-positioning a window inside the group it already belongs to must
    // leave the manual arrangement alone — otherwise every drag "messes up"
    // the layout and windows snap back to preset sizes.
    const enteredNewGroup = (original.groupId || null) !== group.id;
    if (!enteredNewGroup) return;
    if (theme.groupSnapping !== false) {
      setTimeout(() => onAutoArrangeGroup?.(group.id, group.presetId || 'SEMANTIC_WORKSPACE'), 50);
    }
  };

  const handleWireStart = (winId, { x, y }) => {
    const canvasPt = screenToCanvas(x, y, pan.x, pan.y, zoom, ref.current.getBoundingClientRect());
    setWireDrag({ fromId: winId, startX: canvasPt.x, startY: canvasPt.y, x: canvasPt.x, y: canvasPt.y });
  };

  const handleWireDrag = ({ x, y }) => {
    if (!ref.current) return;
    const canvasPt = screenToCanvas(x, y, pan.x, pan.y, zoom, ref.current.getBoundingClientRect());
    setWireDrag(prev => prev ? { ...prev, x: canvasPt.x, y: canvasPt.y } : null);
  };

  const handleWireEnd = (winId, { x, y }) => {
    if (!ref.current) return;
    const canvasPt = screenToCanvas(x, y, pan.x, pan.y, zoom, ref.current.getBoundingClientRect());
    const targetWin = wins.find(w => w.id !== winId && canvasPt.x >= w.x && canvasPt.x <= w.x + w.w && canvasPt.y >= w.y && canvasPt.y <= w.y + w.h);
    if (targetWin && onLinkCreate) onLinkCreate(winId, targetWin.id);
    setWireDrag(null);
  };

  const handleGroupDragEnd = (groupId) => {
    const draggedGroup = canvasGroups.find(g => g.id === groupId);
    if (!draggedGroup) return;
    const owner = getOwningGroup(draggedGroup, canvasGroups.filter(g => g.id !== groupId), true);
    onUpdateGroup(groupId, { groupId: owner ? owner.id : null });
  };

  const getProjectContextForWindow = React.useCallback((win) => {
    if (!win || win.kind !== 'chat') return currentProject;
    const agentId = win.agentId;
    const candidateGroups = canvasGroups.filter(group => {
      if ((group.attachedAgents || []).includes(agentId)) return true;
      const inside = wins.filter(item => windowInsideGroup(item, group));
      return inside.some(item => item.id === win.id) ||
        inside.some(item => item.kind === 'agent' && item.agentId === agentId);
    });

    for (const group of candidateGroups) {
      const filesWin = wins.find(item => item.kind === 'files' && item.dirPath && windowInsideGroup(item, group));
      if (filesWin) {
        return {
          type: 'local',
          name: basenameFromPath(filesWin.dirPath),
          path: filesWin.dirPath,
          scopeType: 'canvas_group',
          scopeId: group.id,
          scopeLabel: group.label || 'Canvas Group',
        };
      }
    }

    return currentProject;
  }, [canvasGroups, currentProject, wins]);

  return { handleAssign, handleDragEnd, handleWireStart, handleWireDrag, handleWireEnd, handleGroupDragEnd, getProjectContextForWindow };
}

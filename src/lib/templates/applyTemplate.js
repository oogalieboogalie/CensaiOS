// Spec 7: add a template board to the live canvas.
import { useWorkspaceStore } from '../store.js';
import { computeFitView } from '../canvasMath.js';
import { layoutTemplateBoard, registerTemplateAgents, requestBoardTemplate } from './boardTemplates.js';

export async function applyTemplateToBoard(templateId, options = {}) {
  const { workspaceId } = useWorkspaceStore.getState();
  const board = await requestBoardTemplate(templateId, { workspaceId, ...options });
  const state = useWorkspaceStore.getState();
  const { windows, groups } = layoutTemplateBoard(board, state);
  registerTemplateAgents(board.agents);
  useWorkspaceStore.setState((current) => ({
    wins: [...current.wins, ...windows],
    canvasGroups: [...current.canvasGroups, ...groups],
    extraAgents: [
      ...(current.extraAgents || []).filter(agent => !(board.agents || []).some(a => a.id === agent.id)),
      ...(board.agents || []),
    ],
    activeId: null,
  }));
  const fit = computeFitView(windows, groups);
  useWorkspaceStore.setState({ pan: { x: fit.x, y: fit.y }, zoom: fit.zoom });
  return { board, windows, groups };
}

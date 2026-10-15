import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import { registerTemplateAgents, templateAgentsOnBoard } from '../../lib/templates/boardTemplates.js';

// Spec 7: a template board's agents (Listing Writer, Market Analyst, ...)
// live on the server per board; their display records ride on the board's
// groups. Register them in the agent list whenever the groups change, so
// every collaborator's chat windows show the right agent.
export function useTemplateAgents() {
  const key = useWorkspaceStore((state) => templateAgentsOnBoard(state.canvasGroups).map(a => `${a.id}:${a.name}`).join('|'));
  React.useEffect(() => {
    if (!key) return;
    registerTemplateAgents(templateAgentsOnBoard(useWorkspaceStore.getState().canvasGroups));
  }, [key]);
}

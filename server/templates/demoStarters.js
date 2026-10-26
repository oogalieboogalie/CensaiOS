// Front door for the try-it board's ready-made starters. The browser demo
// imports only this file (not each starter), so adding a starter here does
// not grow browser-into-server reach.

export {
  buildDeveloperBoard, DEVELOPER_AGENTS, DEVELOPER_TEMPLATE,
} from './starters/developer.js';
export {
  buildCodeWorkspaceBoard, CODE_WORKSPACE_AGENTS, CODE_WORKSPACE_TEMPLATE,
} from './starters/codeWorkspace.js';
export {
  buildCreativeBoard, CREATIVE_AGENTS, CREATIVE_TEMPLATE,
} from './starters/creative.js';
export {
  AGENT_TEAM_AGENTS, AGENT_TEAM_TEMPLATE, buildAgentTeamBoard,
} from './starters/agentTeam.js';
export {
  buildSmallBusinessBoard, SMALL_BUSINESS_AGENTS, SMALL_BUSINESS_TEMPLATE,
} from './starters/smallBusiness.js';
export {
  buildNotesWorkspaceBoard, NOTES_WORKSPACE_AGENTS, NOTES_WORKSPACE_TEMPLATE,
} from './starters/notesWorkspace.js';

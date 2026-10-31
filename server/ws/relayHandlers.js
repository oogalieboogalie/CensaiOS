// server/ws/relayHandlers.js
//
// The board socket's short-lived relays, tried in turn on each message
// (server/ws/workspaceCollaboration.js): live-show reactions and hands, pen
// strokes in progress, games, docked apps, and a chat's agent saved with
// another model. Each returns true once it has handled the message, and
// false for any other type.

import { handleLiveShowMessage } from './liveShowMessages.js';
import { handleInkPreviewMessage } from './inkPreviewMessages.js';
import { handleGameMessage } from './gameMessages.js';
import { handleDockCastMessage } from './dockCastMessages.js';
import { handleAgentChangeMessage } from './agentChangeMessages.js';

export const RELAY_HANDLERS = Object.freeze([
  handleLiveShowMessage, handleInkPreviewMessage, handleGameMessage, handleDockCastMessage, handleAgentChangeMessage,
]);

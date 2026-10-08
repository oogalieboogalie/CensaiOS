// server/ws/inkPreviewMessages.js
//
// Live ink (spec 9): a pen stroke in progress, relayed to everyone else on
// the board so they watch it being drawn. Ephemeral; the finished stroke
// is saved through the shared Yjs doc.

import { publishWorkspaceEvent } from '../collaboration/workspaceHub.js';
import { normalizeInkPreview } from '../../src/lib/ink/live.js';

/** Handles ink.preview; returns false for any other type. */
export function handleInkPreviewMessage(message, context, sendJson) {
  if (message?.type !== 'ink.preview') return false;
  const preview = normalizeInkPreview(message);
  if (!preview) {
    sendJson(context.ws, { type: 'error', reason: 'invalid-ink-preview' });
    return true;
  }
  if (context.spectator) return true;
  publishWorkspaceEvent(context.workspaceId, {
    type: 'ink.preview',
    ...preview,
    clientId: context.clientId,
    actor: context.actor,
  }, { excludeClientId: context.clientId, guests: true });
  return true;
}

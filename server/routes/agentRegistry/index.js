// Agent Registry — REST API surface.
// D2 of the marketplace/registry push. Mounts under /api/agent-registry.
// D3 (WebSocket) and D4 (RegistryWindow) build on this surface.
//
// Auth model: this file applies two router-level guards:
//   - `resolveActor` runs on EVERY request. It populates
//     req.agentActor from req.session.userId, but does NOT block
//     unauthenticated callers — visibility filtering inside the
//     handlers decides who can see what. req.agentActor may be null.
//   - `requireActor` is applied to mutating endpoints + the invoke
//     surface. It blocks unauthenticated callers with 401.
//
// Why both? Public reads of private cards need to know the caller to
// apply visibility filtering; mutating endpoints and the invoke
// surface must be auth-only. The boot guard in server/boot/routers.js
// already rejects unauthenticated requests with 401 in non-test mode;
// these guards are defence-in-depth.

import express from 'express';
import {
  listCards,
  readCard,
  createCard,
  updateCard,
  deleteCard,
} from './cards.js';
import { callCard, readCallResult } from './invoke.js';
import { installCard, listInstalls, removeInstall } from './installs.js';
import { importA2ACard, importN8NChat } from './imports.js';

export const agentRegistryRouter = express.Router();

/**
 * Resolve the authenticated actor (if any). NEVER blocks — the actor
 * may be null for unauthenticated public reads. Handlers consult
 * req.agentActor to apply visibility filtering.
 */
function resolveActor(req, _res, next) {
  const userId = req?.session?.userId;
  if (userId !== undefined && userId !== null && userId !== '') {
    req.agentActor = { kind: 'user', id: String(userId) };
  } else {
    req.agentActor = null;
  }
  next();
}

/**
 * Block unauthenticated callers with 401. Applied to mutating
 * endpoints + the invoke surface, AFTER resolveActor so the actor is
 * available on req.agentActor for the handlers.
 */
function requireActor(req, res, next) {
  if (!req.agentActor) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// Resolve actor on every request, then mount handlers.
agentRegistryRouter.use(resolveActor);

// Public reads — visibility filtering is applied inside the handler.
agentRegistryRouter.get('/cards', listCards);
agentRegistryRouter.get('/cards/:id', readCard);

// Mutating endpoints + invoke surface require auth.
agentRegistryRouter.use(requireActor);

agentRegistryRouter.get('/installs', listInstalls);
agentRegistryRouter.put('/installs/:id', installCard);
agentRegistryRouter.delete('/installs/:id', removeInstall);
agentRegistryRouter.post('/imports/a2a', importA2ACard);
agentRegistryRouter.post('/imports/n8n-chat', importN8NChat);

agentRegistryRouter.post('/cards', createCard);
agentRegistryRouter.patch('/cards/:id', updateCard);
agentRegistryRouter.delete('/cards/:id', deleteCard);

// Invocation endpoints. Both require auth.
agentRegistryRouter.post('/cards/:id/call', callCard);
agentRegistryRouter.get('/cards/:id/calls/:taskId', readCallResult);

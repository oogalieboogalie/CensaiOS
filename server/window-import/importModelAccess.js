// Who asked for a window import. The import's AI call carries the signed-in
// person's verified context, so callModel uses the key they saved in
// Settings (and on a local install only the owner falls back to the
// computer's own keys). Without this the call ran with no "who asked" at all
// and a teammate's check-only import was paid with the owner's key.

import { createModelAccessContext } from '../aiGateway/modelAccess.js';
import { workspaceUsageSink } from '../aiGateway/usageSink.js';
import { resolveImportScope } from './importScope.js';

export const WINDOW_IMPORT_SOURCE = 'window-import';

export class ImportCallerError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

// Returns the extra callModel options for this request: accessContext plus
// usage attribution. Refuses when nobody is signed in.
export async function importModelAccess(req, { resolveScope = resolveImportScope } = {}) {
  if (!req.session?.userId) {
    throw new ImportCallerError('Sign in to import a window.', 401, 'SIGN_IN_REQUIRED');
  }
  const scope = await resolveScope(req);
  const source = WINDOW_IMPORT_SOURCE;
  return {
    accessContext: createModelAccessContext({ userId: scope.userId, workspaceId: scope.workspaceId, source }),
    usageAttribution: { workspaceId: scope.workspaceId, actor: { kind: 'user', id: scope.userId }, source },
    usageSink: workspaceUsageSink,
  };
}

// Route helper: the callModel options, or null after sending a short refusal
// (never the raw error text).
export async function importCallerOrRefuse(req, res, deps) {
  try {
    return await importModelAccess(req, deps);
  } catch (err) {
    const status = err?.statusCode;
    if (status === 401 || status === 403 || status === 404) {
      res.status(status).json({ ok: false, code: err.code || 'ACCESS_DENIED', error: err instanceof ImportCallerError ? err.message : 'You cannot use this workspace.' });
    } else {
      res.status(500).json({ ok: false, code: 'CALLER_UNAVAILABLE', error: 'Could not check who is asking. Try again.' });
    }
    return null;
  }
}

// server/collab/ySchema.js
//
// Y.Doc schema registry (Phase 1): one document per workspaceId.
//
// Root `Y.Map('canvas')` keys, value types, and validators live here so the
// later phases (persistence, client binding, agent writers) share a single
// contract instead of each inventing field names.
//
// Coordinate bounds + id shape mirror server/ws/workspaceCollaboration.js:17-18
// exactly — keep them identical (reuse, don't fork).

export const SCHEMA_VERSION = 1;

export const CANVAS_ROOT = 'canvas';

// Shared-type key registry: root map key -> Yjs container type.
export const CANVAS_KEYS = Object.freeze({
  windows: 'Y.Map',
  groups: 'Y.Map',
  paths: 'Y.Array',
  links: 'Y.Array',
  dock: 'Y.Map',
  meta: 'Y.Map',
});

// Awareness fields (replace the TTL presence protocol in Phase 4).
export const AWARENESS_FIELDS = Object.freeze([
  'cursor',
  'activeWindow',
  'typingIn',
  'actor',
  'clientKind',
]);

// Mirrors workspaceCollaboration.js MAX_COORDINATE — do not diverge.
export const MAX_COORDINATE = 1_000_000;

// Mirrors workspaceCollaboration.js ID_PATTERN — do not diverge.
export const ID_PATTERN = /^[a-zA-Z0-9._:-]{1,96}$/;

export function isValidId(value) {
  return ID_PATTERN.test(String(value ?? ''));
}

export function isValidCoordinate(value) {
  return Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
}

export function isValidWindowGeometry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  return isValidId(entry.id)
    && isValidCoordinate(entry.x)
    && isValidCoordinate(entry.y)
    && Number.isFinite(entry.w) && entry.w > 0
    && Number.isFinite(entry.h) && entry.h > 0;
}

export function canvasKeyType(key) {
  return CANVAS_KEYS[key] ?? null;
}

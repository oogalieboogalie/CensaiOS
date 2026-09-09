import {
  CANVAS_OBJECT_TYPES,
  CANVAS_TYPE_TO_LEGACY_KIND,
  LEGACY_KIND_TO_CANVAS_TYPE,
  getDefaultWindowSize,
} from './windowManifest.js';

export const CANVAS_OBJECT_FIELDS = [
  'id',
  'type',
  'title',
  'x',
  'y',
  'width',
  'height',
  'zIndex',
  'state',
  'metadata',
  'createdBy',
  'lockedBy',
  'createdAt',
  'updatedAt',
];

export { CANVAS_OBJECT_TYPES, CANVAS_TYPE_TO_LEGACY_KIND, LEGACY_KIND_TO_CANVAS_TYPE };

/**
 * Canonical CanvasObject shape. Current workspace state still persists legacy
 * window objects as `wins` with `kind`, `w`, and `h`; normalization helpers keep
 * the data contract explicit without requiring a storage migration in this pass.
 *
 * @typedef {Object} CanvasObject
 * @property {string} id
 * @property {string} type
 * @property {string} title
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {number} zIndex
 * @property {Object} state
 * @property {Object} metadata
 * @property {string|null} createdBy
 * @property {string|null} lockedBy
 * @property {string|null} createdAt
 * @property {string|null} updatedAt
 */

export function getCanvasObjectType(canvasObject) {
  const rawType = canvasObject?.type || canvasObject?.kind || 'generic';
  return LEGACY_KIND_TO_CANVAS_TYPE[rawType] || rawType;
}

export function legacyKindForCanvasType(type) {
  return CANVAS_TYPE_TO_LEGACY_KIND[type] || type || 'generic';
}

export function normalizeCanvasObject(canvasObject = {}) {
  const type = getCanvasObjectType(canvasObject);
  const defaultSize = getDefaultWindowSize(type);
  return {
    id: canvasObject.id || null,
    type,
    title: canvasObject.title || '',
    x: Number.isFinite(canvasObject.x) ? canvasObject.x : 0,
    y: Number.isFinite(canvasObject.y) ? canvasObject.y : 0,
    width: Number.isFinite(canvasObject.width) ? canvasObject.width : (Number.isFinite(canvasObject.w) ? canvasObject.w : defaultSize.w),
    height: Number.isFinite(canvasObject.height) ? canvasObject.height : (Number.isFinite(canvasObject.h) ? canvasObject.h : defaultSize.h),
    zIndex: Number.isFinite(canvasObject.zIndex) ? canvasObject.zIndex : null,
    state: canvasObject.state && typeof canvasObject.state === 'object' ? canvasObject.state : {},
    metadata: canvasObject.metadata && typeof canvasObject.metadata === 'object' ? canvasObject.metadata : {},
    createdBy: canvasObject.createdBy || null,
    lockedBy: canvasObject.lockedBy || null,
    createdAt: canvasObject.createdAt || null,
    updatedAt: canvasObject.updatedAt || null,
  };
}

export function canvasObjectToLegacyWindow(canvasObject = {}) {
  const normalized = normalizeCanvasObject(canvasObject);
  return {
    ...canvasObject,
    type: normalized.type,
    title: normalized.title,
    kind: canvasObject.kind || legacyKindForCanvasType(normalized.type),
    x: normalized.x,
    y: normalized.y,
    width: normalized.width,
    height: normalized.height,
    w: normalized.width,
    h: normalized.height,
    zIndex: normalized.zIndex,
    state: normalized.state,
    metadata: normalized.metadata,
    createdBy: normalized.createdBy,
    lockedBy: normalized.lockedBy,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
  };
}

import { DEFAULT_IMAGE_STUDIO_STATE } from './constants.js';

export function normalizeImageStudioState(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    ...DEFAULT_IMAGE_STUDIO_STATE,
    ...source,
    objects: Array.isArray(source.objects) ? source.objects : [],
    selectedObjectId: source.selectedObjectId || null,
  };
}

export function makeStudioObject(type, point, options = {}) {
  const base = {
    id: options.id || `obj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    color: options.color || '#ffffff',
    strokeWidth: options.strokeWidth || 3,
  };

  if (type === 'path') return { ...base, points: [point] };
  if (type === 'rect' || type === 'ellipse') {
    return { ...base, x: point.x, y: point.y, w: 1, h: 1, fill: 'transparent' };
  }
  if (type === 'line') return { ...base, x1: point.x, y1: point.y, x2: point.x, y2: point.y };
  if (type === 'text') return { ...base, x: point.x, y: point.y, text: options.text || 'Text', fontSize: 28 };
  if (type === 'image') {
    return {
      ...base,
      x: point.x,
      y: point.y,
      w: options.w || 180,
      h: options.h || 140,
      imageId: options.imageId,
      src: options.src,
    };
  }
  return { ...base, x: point.x, y: point.y };
}

export function updateDraftObject(object, point) {
  if (!object) return object;
  if (object.type === 'path') return { ...object, points: [...object.points, point] };
  if (object.type === 'rect' || object.type === 'ellipse') {
    return { ...object, w: point.x - object.x, h: point.y - object.y };
  }
  if (object.type === 'line') return { ...object, x2: point.x, y2: point.y };
  return object;
}

export function addOrReplaceObject(state, object) {
  const exists = state.objects.some(item => item.id === object.id);
  return {
    ...state,
    selectedObjectId: object.id,
    objects: exists
      ? state.objects.map(item => item.id === object.id ? object : item)
      : [...state.objects, object],
  };
}

export function deleteSelectedObject(state) {
  if (!state.selectedObjectId) return state;
  return {
    ...state,
    objects: state.objects.filter(item => item.id !== state.selectedObjectId),
    selectedObjectId: null,
  };
}

export function moveObject(object, dx, dy) {
  if (object.type === 'path') {
    return { ...object, points: object.points.map(point => ({ x: point.x + dx, y: point.y + dy })) };
  }
  if (object.type === 'line') {
    return { ...object, x1: object.x1 + dx, y1: object.y1 + dy, x2: object.x2 + dx, y2: object.y2 + dy };
  }
  return { ...object, x: object.x + dx, y: object.y + dy };
}

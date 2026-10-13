const STORAGE_PREFIX = 'homebase.whiteboard.';

export function getWhiteboardStorageKey(windowId) {
  return `${STORAGE_PREFIX}${windowId || 'default'}`;
}

export function createEmptyWhiteboardScene(name = 'Untitled sketch') {
  return {
    elements: [],
    files: {},
    appState: {
      name,
      viewBackgroundColor: 'transparent',
    },
  };
}

export function normalizeWhiteboardScene(scene, fallbackName) {
  const base = createEmptyWhiteboardScene(fallbackName);
  if (!scene || typeof scene !== 'object') return base;
  return {
    elements: Array.isArray(scene.elements) ? scene.elements : base.elements,
    files: scene.files && typeof scene.files === 'object' ? scene.files : base.files,
    appState: {
      ...base.appState,
      ...(scene.appState && typeof scene.appState === 'object' ? scene.appState : {}),
    },
  };
}

export function readWhiteboardScene(win) {
  const fallbackName = win?.title || 'Sketchpad';
  const legacyKey = win?.state?.excalidraw; // fallback for backwards compatibility
  const activeKey = win?.state?.whiteboard || legacyKey;

  if (typeof window !== 'undefined' && win?.id) {
    try {
      const raw = window.localStorage.getItem(getWhiteboardStorageKey(win.id));
      if (raw) return normalizeWhiteboardScene(JSON.parse(raw), fallbackName);
      
      // Fallback to legacy localstorage prefix if exists
      const legacyRaw = window.localStorage.getItem(`homebase.excalidraw.${win.id}`);
      if (legacyRaw) return normalizeWhiteboardScene(JSON.parse(legacyRaw), fallbackName);
    } catch {
      return normalizeWhiteboardScene(activeKey, fallbackName);
    }
  }
  return normalizeWhiteboardScene(activeKey, fallbackName);
}

export function buildWhiteboardScene(elements, appState, files, fallbackName) {
  return normalizeWhiteboardScene(
    { elements, appState, files },
    fallbackName
  );
}

export function persistWhiteboardScene(windowId, scene) {
  if (typeof window === 'undefined' || !windowId) return;
  try {
    window.localStorage.setItem(
      getWhiteboardStorageKey(windowId),
      JSON.stringify(normalizeWhiteboardScene(scene))
    );
  } catch {
    return;
  }
}

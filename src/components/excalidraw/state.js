const STORAGE_PREFIX = 'homebase.excalidraw.';

export function getExcalidrawStorageKey(windowId) {
  return `${STORAGE_PREFIX}${windowId || 'default'}`;
}

export function createEmptyExcalidrawScene(name = 'Untitled sketch') {
  return {
    elements: [],
    files: {},
    appState: {
      name,
      viewBackgroundColor: 'transparent',
    },
  };
}

export function normalizeExcalidrawScene(scene, fallbackName) {
  const base = createEmptyExcalidrawScene(fallbackName);
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

export function readExcalidrawScene(win) {
  const fallbackName = win?.title || 'Excalidraw sketch';
  if (typeof window !== 'undefined' && win?.id) {
    try {
      const raw = window.localStorage.getItem(getExcalidrawStorageKey(win.id));
      if (raw) return normalizeExcalidrawScene(JSON.parse(raw), fallbackName);
    } catch {
      return normalizeExcalidrawScene(win?.state?.excalidraw, fallbackName);
    }
  }
  return normalizeExcalidrawScene(win?.state?.excalidraw, fallbackName);
}

export function buildExcalidrawScene(elements, appState, files, fallbackName) {
  return normalizeExcalidrawScene(
    { elements, appState, files },
    fallbackName
  );
}

export function persistExcalidrawScene(windowId, scene) {
  if (typeof window === 'undefined' || !windowId) return;
  try {
    window.localStorage.setItem(
      getExcalidrawStorageKey(windowId),
      JSON.stringify(normalizeExcalidrawScene(scene))
    );
  } catch {
    return;
  }
}

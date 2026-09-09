import React from 'react';
import { DEFAULT_IMAGE_STUDIO_STATE } from './constants.js';
import {
  addOrReplaceObject,
  deleteSelectedObject,
  makeStudioObject,
  normalizeImageStudioState,
} from './model.js';
import { useWorkspaceStore } from '../../../lib/store.js';

export function useImageStudio(win, onUpdate) {
  const workspaceId = useWorkspaceStore(store => store.workspaceId);
  const initial = normalizeImageStudioState(win.state?.imageStudio || win.canvasState || {});
  const [state, setState] = React.useState(initial);
  const [tool, setTool] = React.useState('path');
  const [color, setColor] = React.useState('#ffffff');
  const [strokeWidth, setStrokeWidth] = React.useState(5);
  const [textValue, setTextValue] = React.useState('Label');
  const [gallery, setGallery] = React.useState([]);
  const [selectedImageId, setSelectedImageId] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const historyRef = React.useRef([]);
  const redoRef = React.useRef([]);

  const persist = React.useCallback((next, options = {}) => {
    const normalized = normalizeImageStudioState(next);
    setState((current) => {
      if (options.history !== false) historyRef.current.push(options.historyState || current);
      redoRef.current = [];
      return normalized;
    });
    onUpdate?.({
      state: { ...(win.state || {}), imageStudio: normalized },
      canvasState: normalized,
    });
  }, [onUpdate, win.state]);

  React.useEffect(() => {
    if (!workspaceId) {
      setGallery([]);
      return;
    }
    let active = true;
    fetch(`/api/images/gallery?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(res => res.ok ? res.json() : { images: [] })
      .then(data => {
        if (active) setGallery(Array.isArray(data.images) ? data.images : []);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [workspaceId]);

  const updateFields = React.useCallback((patch) => {
    persist({ ...state, ...patch });
  }, [persist, state]);

  const setCanvasState = React.useCallback((next, options) => persist(next, options), [persist]);
  const deleteSelected = React.useCallback(() => persist(deleteSelectedObject(state)), [persist, state]);
  const clearCanvas = React.useCallback(() => persist({ ...state, objects: [], selectedObjectId: null }), [persist, state]);

  const insertSelectedImage = React.useCallback(() => {
    const image = gallery.find(item => item.id === selectedImageId);
    if (!image) return;
    persist(addOrReplaceObject(state, makeStudioObject('image', { x: 80, y: 80 }, {
      imageId: image.id,
      src: image.src,
      w: 220,
      h: 160,
    })));
  }, [gallery, persist, selectedImageId, state]);

  const undo = React.useCallback(() => {
    const previous = historyRef.current.pop();
    if (!previous) return;
    redoRef.current.push(state);
    setState(previous);
    onUpdate?.({ state: { ...(win.state || {}), imageStudio: previous }, canvasState: previous });
  }, [onUpdate, state, win.state]);

  const redo = React.useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    historyRef.current.push(state);
    setState(next);
    onUpdate?.({ state: { ...(win.state || {}), imageStudio: next }, canvasState: next });
  }, [onUpdate, state, win.state]);

  const generate = React.useCallback(async () => {
    if (!state.prompt.trim()) return;
    if (!workspaceId) {
      setError('Open a workspace before generating an image.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: state.prompt,
          additionalInstructions: state.additionalInstructions,
          model: state.model,
          canvasState: state,
          sourceWindowId: win.id,
          workspaceId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate image');
      setGallery(items => [data.image, ...items.filter(item => item.id !== data.image.id)]);
      setSelectedImageId(data.image.id);
    } catch (err) {
      setError(err.message || 'Failed to generate image');
    } finally {
      setLoading(false);
    }
  }, [state, win.id, workspaceId]);

  const deleteGalleryItem = React.useCallback(async (id) => {
    if (!workspaceId) return;
    const res = await fetch(
      `/api/images/gallery/${encodeURIComponent(id)}?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: 'DELETE' }
    );
    if (!res.ok) return;
    setGallery(items => items.filter(item => item.id !== id));
    if (selectedImageId === id) setSelectedImageId(null);
  }, [selectedImageId, workspaceId]);

  return {
    state: state || DEFAULT_IMAGE_STUDIO_STATE,
    setCanvasState,
    updateFields,
    tool,
    setTool,
    color,
    setColor,
    strokeWidth,
    setStrokeWidth,
    textValue,
    setTextValue,
    gallery,
    selectedImageId,
    setSelectedImageId,
    loading,
    error,
    generate,
    undo,
    redo,
    deleteSelected,
    clearCanvas,
    insertSelectedImage,
    deleteGalleryItem,
  };
}

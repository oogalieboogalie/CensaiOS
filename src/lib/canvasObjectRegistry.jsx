import React from 'react';
import { Chrome } from '../components/Chrome.jsx';
import { WINDOW_TYPES } from '../components/windows/windowRegistry.js';
import { getCanvasObjectType } from './canvasObjectTypes.js';

export function GenericCanvasObjectWindow({ canvasObject }) {
  const type = getCanvasObjectType(canvasObject);
  return (
    <div style={{ padding: 20, color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      Unknown canvas object type: {type}
    </div>
  );
}

export const CANVAS_OBJECT_RENDERERS = {
  ...WINDOW_TYPES,
  chrome: Chrome,
  generic: GenericCanvasObjectWindow,
};

export function getCanvasObjectRenderer(canvasObject) {
  const type = getCanvasObjectType(canvasObject);
  return CANVAS_OBJECT_RENDERERS[type] || CANVAS_OBJECT_RENDERERS.generic;
}

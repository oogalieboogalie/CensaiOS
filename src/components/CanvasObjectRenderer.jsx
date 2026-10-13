import React from 'react';
import { getCanvasObjectRenderer, GenericCanvasObjectWindow } from '../lib/canvasObjectRegistry.jsx';
import { getCanvasObjectType, legacyKindForCanvasType } from '../lib/canvasObjectTypes.js';
import { WindowLazyErrorBoundary } from './windows/WindowLazyErrorBoundary.jsx';
import { WindowSuspenseFallback } from './windows/WindowSuspenseFallback.jsx';

export const CanvasObjectRenderer = React.memo(({
  canvasObject,
  onUpdate,
  ...rendererProps
}) => {
  if (!canvasObject) {
    return <GenericCanvasObjectWindow canvasObject={{ type: 'missing' }} />;
  }

  const Renderer = getCanvasObjectRenderer(canvasObject);
  const type = getCanvasObjectType(canvasObject);
  const win = {
    ...canvasObject,
    kind: canvasObject.kind || legacyKindForCanvasType(type),
    w: Number.isFinite(canvasObject.w) ? canvasObject.w : canvasObject.width,
    h: Number.isFinite(canvasObject.h) ? canvasObject.h : canvasObject.height,
  };

  return (
    <WindowLazyErrorBoundary win={win} type={type}>
      <React.Suspense fallback={<WindowSuspenseFallback />}>
        <Renderer
          {...rendererProps}
          canvasObject={canvasObject}
          win={win}
          type={type}
          onUpdate={onUpdate}
        />
      </React.Suspense>
    </WindowLazyErrorBoundary>
  );
});

export default CanvasObjectRenderer;

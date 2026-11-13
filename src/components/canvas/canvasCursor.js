// The board cursor for the tool in hand. Drawing tools use a crosshair.

export function canvasCursor({ activeTool, penMode, isPanning, spaceHeld }) {
  if (activeTool === 'pen' || activeTool === 'lasso' || activeTool === 'highlight' || penMode) return 'crosshair';
  if (activeTool === 'rect' || activeTool === 'ellipse' || activeTool === 'line' || activeTool === 'arrow') return 'crosshair';
  if (activeTool === 'text') return 'text';
  if (activeTool === 'eraser') return 'cell';
  if (activeTool === 'pan') return isPanning ? 'grabbing' : 'grab';
  if (spaceHeld) return 'grab';
  return isPanning ? 'grabbing' : 'default';
}

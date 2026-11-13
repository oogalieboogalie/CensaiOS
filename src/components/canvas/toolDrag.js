// Which drag a tool starts. The pointer hook keeps the event wiring; this
// only picks the drag record so the hook does not grow a branch per tool.
import { highlightInk } from './highlightInk.js';

const SHAPES = new Set(['rect', 'ellipse', 'line', 'arrow']);

export function beginCanvasDrag({
  activeTool, penMode, isPen, isPenEraser, pointerId, canvasPt, shiftKey, penColor, penSize,
}) {
  if (activeTool === 'eraser' || isPenEraser) {
    return { drag: { id: pointerId, isErasing: true }, erase: true };
  }
  if (activeTool === 'highlight') {
    return { drag: { id: pointerId, isDrawing: true }, draw: true, ink: highlightInk(penColor, penSize) };
  }
  if (activeTool === 'pen' || (penMode && isPen)) {
    return { drag: { id: pointerId, isDrawing: true }, draw: true };
  }
  if (activeTool === 'lasso') {
    return { drag: { id: pointerId, isLasso: true }, lasso: true };
  }
  if (SHAPES.has(activeTool) || activeTool === 'text') {
    return { drag: { id: pointerId, x0: canvasPt.x, y0: canvasPt.y, started: false, mode: activeTool } };
  }
  return {
    drag: { id: pointerId, x0: canvasPt.x, y0: canvasPt.y, started: false, mode: shiftKey ? 'region' : 'selection' },
  };
}

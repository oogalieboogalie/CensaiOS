import { MAX_ZOOM, MIN_ZOOM, getPanAfterZoom } from '../../lib/canvasMath.js';

export function useCanvasZoomControls({ ref, pan, zoom, onPanZoom, onFitView }) {
  const zoomIn = () => {
    const newZoom = Math.min(MAX_ZOOM, zoom * 1.25);
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    onPanZoom({ ...getPanAfterZoom(pan.x, pan.y, cx, cy, zoom, newZoom), zoom: newZoom });
  };
  const zoomOut = () => {
    const newZoom = Math.max(MIN_ZOOM, zoom / 1.25);
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    onPanZoom({ ...getPanAfterZoom(pan.x, pan.y, cx, cy, zoom, newZoom), zoom: newZoom });
  };
  const resetView = () => {
    if (onFitView) onFitView();
    else onPanZoom({ panX: 0, panY: 0, zoom: 1 });
  };
  return { zoomIn, zoomOut, resetView };
}

import React from 'react';
import { distance, screenToCanvas } from '../../lib/canvasMath.js';
import { windowsInSelection } from './CanvasInteractions.js';
import { strokesInBox } from '../../lib/ink/shapes.js';
import { useInkPointer } from './useInkPointer.js';
import {
  blurActiveEditable, buildBandBox, buildPinchStart, buildRectStroke,
  computePinchZoom, consumeSuppression, isInteractivePanTarget, shouldStartCanvasPan,
} from './pointerBuilders.js';

// Re-exported so existing importers keep working after the builders extraction.
export { shouldStartCanvasPan };

export function useCanvasPointer({
  ref,
  pan,
  zoom,
  onPanZoom,
  onSelect,
  onSpawnGroup,
  wins,
  onSelection,
  activeTool,
  penMode,
  penColor,
  penSize,
  paths = [],
  setPaths,
  setRegion,
  onSpawn,
  spaceRef,
  panMode = 'both',
}) {
  const [band, setBand] = React.useState(null);
  const ink = useInkPointer({ ref, pan, zoom, penColor, penSize, paths, setPaths });
  // Mirrors panRef for cursor rendering: refs don't trigger re-renders, so a
  // bare Boolean(panRef.current) stays stuck on "grabbing" after the pan ends.
  const [isPanning, setIsPanning] = React.useState(false);
  const dragRef = React.useRef(null);
  const panRef = React.useRef(null);
  const activeTouchPointsRef = React.useRef(new Map());
  const pinchRef = React.useRef(null);
  const suppressContextMenuRef = React.useRef(false);

  const onPointerDown = (e) => {
    // Spec 9: a palm resting on the screen never pans, pinches or draws.
    if (ink.palm.classify(e, 'down') === 'palm') return;
    const isCanvasBg = e.target === ref.current || e.target.dataset?.canvasBg;
    const isPen = e.pointerType === 'pen';
    const isTouch = e.pointerType === 'touch';
    const isPenEraser = penMode && isPen && (e.button === 5 || e.buttons === 32);

    // Blur active input/textarea/contenteditable on canvas background click/pan
    const isPanningStart = shouldStartCanvasPan(e.button, spaceRef.current, panMode);
    if (isCanvasBg || isPanningStart) blurActiveEditable();

    if (isTouch) {
      activeTouchPointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activeTouchPointsRef.current.size >= 2) {
        const touches = [...activeTouchPointsRef.current.values()];
        pinchRef.current = buildPinchStart(touches[0], touches[1], zoom, pan);
        e.preventDefault();
        dragRef.current = null;
        panRef.current = null;
        setIsPanning(false);
        setBand(null);
        setRegion(null);
        ink.commitStroke();
        try { ref.current.setPointerCapture(e.pointerId); } catch {}
        return;
      }
      // Pen draws, fingers navigate: one finger on the board pans it.
      if (!isCanvasBg) return;
    }

    const isPanTool = activeTool === 'pan' && e.button === 0 && isCanvasBg;
    // A stuck-or-held Space must never turn clicks on canvas UI into pan drags.
    const canPan = !(e.button === 0 && isInteractivePanTarget(e.target));
    if ((isPanningStart && canPan) || isPanTool || (isTouch && e.button === 0 && isCanvasBg)) {
      e.preventDefault();
      panRef.current = { sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y };
      setIsPanning(true);
      try { ref.current.setPointerCapture(e.pointerId); } catch {}
      return;
    }

    if (e.button === 2) {
      if (!isCanvasBg) return;
      e.preventDefault();
      const rect = ref.current.getBoundingClientRect();
      const canvasPt = screenToCanvas(e.clientX, e.clientY, pan.x, pan.y, zoom, rect);
      dragRef.current = { id: e.pointerId, x0: canvasPt.x, y0: canvasPt.y, started: false, mode: 'group' };
      try { ref.current.setPointerCapture(e.pointerId); } catch {}
      onSelect(null);
      onSelection?.([]);
      setRegion(null);
    }

    if ((e.button === 0 || isPenEraser) && isCanvasBg) ink.setInkSelection([]);
    if (e.button === 0 || isPenEraser) {
      if (!isCanvasBg && activeTool !== 'eraser') {
        onSelect(null);
        return;
      }
      e.preventDefault();
      const rect = ref.current.getBoundingClientRect();
      const canvasPt = screenToCanvas(e.clientX, e.clientY, pan.x, pan.y, zoom, rect);

      if (activeTool === 'eraser' || isPenEraser) {
        dragRef.current = { id: e.pointerId, isErasing: true };
        setPaths(prev => prev.filter(p => !p.pts.some(pt => distance(pt.x, pt.y, canvasPt.x, canvasPt.y) < 16 / zoom)));
      } else if (activeTool === 'pen' || (penMode && isPen)) {
        dragRef.current = { id: e.pointerId, isDrawing: true };
        ink.startStroke(e);
      } else if (activeTool === 'lasso') {
        dragRef.current = { id: e.pointerId, isLasso: true };
        ink.startLasso(e);
      } else if (activeTool === 'rect' || activeTool === 'text') {
        dragRef.current = {
          id: e.pointerId,
          x0: canvasPt.x,
          y0: canvasPt.y,
          started: false,
          mode: activeTool,
        };
      } else {
        dragRef.current = {
          id: e.pointerId,
          x0: canvasPt.x,
          y0: canvasPt.y,
          started: false,
          mode: e.shiftKey ? 'region' : 'selection',
        };
      }

      try { ref.current.setPointerCapture(e.pointerId); } catch {}
      onSelect(null);
      onSelection?.([]);
      setRegion(null);
    }
  };

  const onPointerMove = (e) => {
    if (ink.palm.classify(e) === 'palm') return;
    if (e.pointerType === 'touch') {
      activeTouchPointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchRef.current && activeTouchPointsRef.current.size >= 2) {
        const touches = [...activeTouchPointsRef.current.values()];
        onPanZoom(computePinchZoom(touches[0], touches[1], ref.current.getBoundingClientRect(), pinchRef.current));
        return;
      }
    }

    if (panRef.current) {
      const p = panRef.current;
      onPanZoom({ panX: p.ox + (e.clientX - p.sx), panY: p.oy + (e.clientY - p.sy), zoom });
      return;
    }

    if (!dragRef.current) return;
    const rect = ref.current.getBoundingClientRect();
    const canvasPt = screenToCanvas(e.clientX, e.clientY, pan.x, pan.y, zoom, rect);
    const d = dragRef.current;

    if (d.isDrawing) return ink.extendStroke(e);
    if (d.isLasso) return ink.extendLasso(e);

    if (d.isErasing) {
      setPaths(prev => prev.filter(p => !p.pts.some(pt => distance(pt.x, pt.y, canvasPt.x, canvasPt.y) < 16 / zoom)));
      return;
    }

    if (!d.started && distance(canvasPt.x, canvasPt.y, d.x0, d.y0) < 6 / zoom) return;
    d.started = true;
    // Text clicks spawn on pointer-up; dragging with the text tool draws nothing.
    if (d.mode === 'text') return;
    setBand(buildBandBox(d, canvasPt));
  };

  const onPointerUp = (e) => {
    if (ink.palm.classify(e, 'up') === 'palm') return;
    if (e.pointerType === 'touch') {
      activeTouchPointsRef.current.delete(e.pointerId);
      if (activeTouchPointsRef.current.size < 2) pinchRef.current = null;
    }

    if (panRef.current) {
      panRef.current = null;
      setIsPanning(false);
      try { ref.current.releasePointerCapture(e.pointerId); } catch {}
      return;
    }
    const d = dragRef.current;
    if (d) {
      try { ref.current.releasePointerCapture(e.pointerId); } catch {}
    }
    dragRef.current = null;

    if (d?.isDrawing) return ink.commitStroke();
    if (d?.isLasso) return ink.endLasso();

    if (d?.isErasing) return;

    // Rect tool: commit the dragged band as a closed stroke in pen color/size.
    if (d?.mode === 'rect') {
      if (d.started) {
        const stroke = buildRectStroke(band, zoom, penColor, penSize);
        if (stroke) setPaths(prev => [...prev, stroke]);
      }
      setBand(null);
      return;
    }

    // Text tool: plain click drops a note window; a drag does nothing.
    if (d?.mode === 'text') {
      if (!d.started) {
        onSpawn?.('doc', { fileName: 'Canvas note.md', text: '' }, { x: d.x0, y: d.y0 });
      }
      setBand(null);
      return;
    }

    if (d?.mode === 'group' && d.started) suppressContextMenuRef.current = true;
    if (d && d.started && band && band.w > 30 && band.h > 30) {
      if (d.mode === 'group') {
        onSpawnGroup({ x: band.x, y: band.y }, { w: band.w, h: band.h });
      } else if (d.mode === 'selection') {
        onSelection?.(windowsInSelection(wins, band));
        const inkIds = strokesInBox(paths, band);
        ink.setInkSelection(inkIds);
        if (!inkIds.length) setRegion(band);
      } else {
        setRegion(band);
      }
    }
    setBand(null);
  };

  const consumeContextMenuSuppression = () => consumeSuppression(suppressContextMenuRef);

  return { band, setBand, ink, currentPath: ink.currentPath, onPointerDown, onPointerMove, onPointerUp, panRef, isPanning, consumeContextMenuSuppression };
}

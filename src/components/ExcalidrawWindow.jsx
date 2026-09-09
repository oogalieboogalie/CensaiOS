import React from 'react';
import { WindowTitle } from './windows/WindowTitle.jsx';
import { persistExcalidrawScene, readExcalidrawScene } from './excalidraw/state.js';
import { getBoundingBox } from './excalidraw/helpers.js';
import { WhiteboardToolbar } from './excalidraw/WhiteboardToolbar.jsx';
import { WhiteboardCanvas } from './excalidraw/WhiteboardCanvas.jsx';
import { Icon } from './Icons.jsx';

export function ExcalidrawWindow({ win, onUpdate, zoom = 1 }) {
  const [elements, setElements] = React.useState(() => {
    const scene = readExcalidrawScene(win);
    return Array.isArray(scene?.elements) ? scene.elements : [];
  });
  const [activeMode, setActiveMode] = React.useState('pencil');
  const [selectedId, setSelectedId] = React.useState(null);
  const [color, setColor] = React.useState('var(--accent)');
  const [strokeWidth, setStrokeWidth] = React.useState(3);

  // Interaction tracking
  const [drawingElement, setDrawingElement] = React.useState(null);
  const [dragState, setDragState] = React.useState(null);
  const [resizeState, setResizeState] = React.useState(null);
  const [editingTextId, setEditingTextId] = React.useState(null);
  const [tempTextValue, setTempTextValue] = React.useState('');

  const svgRef = React.useRef(null);
  const saveTimerRef = React.useRef(null);

  const queueSave = React.useCallback((nextElements) => {
    setElements(nextElements);
    persistExcalidrawScene(win.id, { elements: nextElements });
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      onUpdate?.({ state: { ...(win.state || {}), excalidraw: { elements: nextElements } } });
    }, 200);
  }, [onUpdate, win.id, win.state]);

  React.useEffect(() => () => saveTimerRef.current && window.clearTimeout(saveTimerRef.current), []);

  const getCoordinates = (e) => {
    const rect = svgRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
    const scale = zoom * (win.fontScale || 1.0);
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  };

  const handlePointerDown = (e) => {
    if (editingTextId) finalizeTextEdit();
    const { x, y } = getCoordinates(e);

    if (activeMode === 'select') {
      const selEl = selectedId && elements.find(el => el.id === selectedId);
      if (selEl && ['rect', 'circle'].includes(selEl.type)) {
        const { x: ex, y: ey, w: ew, h: eh } = selEl;
        const handles = [{ id: 'tl', cx: ex, cy: ey }, { id: 'tr', cx: ex + ew, cy: ey }, { id: 'bl', cx: ex, cy: ey + eh }, { id: 'br', cx: ex + ew, cy: ey + eh }];
        const hit = handles.find(h => Math.hypot(h.cx - x, h.cy - y) < 8);
        if (hit) {
          setResizeState({ id: selectedId, handle: hit.id, startX: x, startY: y, initialElement: { ...selEl } });
          e.stopPropagation(); return;
        }
      }
      const hit = [...elements].reverse().find(el => {
        const box = getBoundingBox(el);
        const pad = ['pencil', 'arrow'].includes(el.type) ? 8 : 2;
        return x >= box.x - pad && x <= box.x + box.w + pad && y >= box.y - pad && y <= box.y + box.h + pad;
      });
      if (hit) {
        setSelectedId(hit.id);
        setDragState({ id: hit.id, startX: x, startY: y, initialElement: JSON.parse(JSON.stringify(hit)) });
      } else setSelectedId(null);
      return;
    }

    const newId = crypto.randomUUID();
    let newEl = null;
    if (activeMode === 'pencil') newEl = { id: newId, type: 'pencil', x, y, pts: [{ x, y }], color, strokeWidth };
    else if (activeMode === 'rect') newEl = { id: newId, type: 'rect', x, y, w: 0, h: 0, color, strokeWidth };
    else if (activeMode === 'circle') newEl = { id: newId, type: 'circle', x, y, w: 0, h: 0, color, strokeWidth };
    else if (activeMode === 'arrow') newEl = { id: newId, type: 'arrow', x, y, pts: [{ x, y }, { x, y }], color, strokeWidth };
    else if (activeMode === 'text') {
      newEl = { id: newId, type: 'text', x, y, text: '', color };
      setElements(prev => [...prev, newEl]);
      setEditingTextId(newId); setTempTextValue(''); setSelectedId(newId);
      return;
    }
    if (newEl) { setDrawingElement(newEl); setElements(prev => [...prev, newEl]); }
  };

  const handlePointerMove = (e) => {
    const { x, y } = getCoordinates(e);
    if (resizeState) {
      const { id, handle, startX, startY, initialElement } = resizeState;
      const dx = x - startX, dy = y - startY;
      setElements(elements.map(el => {
        if (el.id !== id) return el;
        const u = { ...el };
        if (handle === 'br') { u.w = Math.max(5, initialElement.w + dx); u.h = Math.max(5, initialElement.h + dy); }
        else if (handle === 'tr') { u.w = Math.max(5, initialElement.w + dx); u.y = initialElement.y + dy; u.h = Math.max(5, initialElement.h - dy); }
        else if (handle === 'bl') { u.x = initialElement.x + dx; u.w = Math.max(5, initialElement.w - dx); u.h = Math.max(5, initialElement.h + dy); }
        else if (handle === 'tl') { u.x = initialElement.x + dx; u.w = Math.max(5, initialElement.w - dx); u.y = initialElement.y + dy; u.h = Math.max(5, initialElement.h - dy); }
        return u;
      }));
    } else if (dragState) {
      const { id, startX, startY, initialElement } = dragState;
      const dx = x - startX, dy = y - startY;
      setElements(elements.map(el => {
        if (el.id !== id) return el;
        const u = { ...el };
        if (['pencil', 'arrow'].includes(u.type)) {
          u.pts = initialElement.pts.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
          if (u.pts.length > 0) { u.x = u.pts[0].x; u.y = u.pts[0].y; }
        } else { u.x = initialElement.x + dx; u.y = initialElement.y + dy; }
        return u;
      }));
    } else if (drawingElement) {
      setElements(elements.map(el => {
        if (el.id !== drawingElement.id) return el;
        const u = { ...el };
        if (u.type === 'pencil') u.pts = [...u.pts, { x, y }];
        else if (['rect', 'circle'].includes(u.type)) { u.w = x - u.x; u.h = y - u.y; }
        else if (u.type === 'arrow') u.pts = [u.pts[0], { x, y }];
        return u;
      }));
    }
  };

  const handlePointerUp = () => {
    if (drawingElement) {
      const next = elements.map(el => {
        if (el.id !== drawingElement.id) return el;
        const u = { ...el };
        if (['rect', 'circle'].includes(u.type)) {
          if (u.w < 0) { u.x += u.w; u.w = Math.abs(u.w); }
          if (u.h < 0) { u.y += u.h; u.h = Math.abs(u.h); }
        }
        return u;
      });
      setDrawingElement(null); queueSave(next);
      if (activeMode !== 'pencil') { setActiveMode('select'); setSelectedId(drawingElement.id); }
    }
    if (dragState) { setDragState(null); queueSave(elements); }
    if (resizeState) { setResizeState(null); queueSave(elements); }
  };

  const finalizeTextEdit = () => {
    if (!editingTextId) return;
    const value = tempTextValue.trim();
    const next = value === '' ? elements.filter(el => el.id !== editingTextId) : elements.map(el => el.id === editingTextId ? { ...el, text: value } : el);
    if (value === '') setSelectedId(null);
    setEditingTextId(null); setTempTextValue(''); queueSave(next);
  };

  const handleReset = () => { setSelectedId(null); queueSave([]); };
  const handleDeleteSelected = () => {
    if (!selectedId) return;
    queueSave(elements.filter(el => el.id !== selectedId)); setSelectedId(null);
  };

  const bringToFront = () => {
    const idx = elements.findIndex(el => el.id === selectedId);
    if (idx === -1 || idx === elements.length - 1) return;
    const next = [...elements], [t] = next.splice(idx, 1);
    next.push(t); queueSave(next);
  };

  const sendToBack = () => {
    const idx = elements.findIndex(el => el.id === selectedId);
    if (idx === -1 || idx === 0) return;
    const next = [...elements], [t] = next.splice(idx, 1);
    next.unshift(t); queueSave(next);
  };

  const handleTextDoubleClick = (e, el) => {
    e.stopPropagation();
    if (activeMode === 'select') { setEditingTextId(el.id); setTempTextValue(el.text); }
  };

  const subtitle = elements.length > 0 ? `${elements.length} object${elements.length === 1 ? '' : 's'}` : 'Blank canvas';

  return (
    <>
      <WindowTitle icon={<Icon.Edit size={14} />} label="Sketchpad" subtitle={subtitle}>
        <button
          onClick={(e) => { e.stopPropagation(); handleReset(); }}
          style={{ all: 'unset', cursor: 'pointer', padding: '2px 8px', borderRadius: 4, fontSize: 10, background: 'var(--surface-2)', color: 'var(--ink-faint)', border: '1px solid var(--hairline)' }}
          title="Clear everything"
        >
          Clear Board
        </button>
      </WindowTitle>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', background: 'var(--surface)' }}>
        <WhiteboardToolbar
          activeMode={activeMode} setActiveMode={setActiveMode} setSelectedId={setSelectedId}
          color={color} setColor={setColor} strokeWidth={strokeWidth} setStrokeWidth={setStrokeWidth}
          selectedId={selectedId} sendToBack={sendToBack} bringToFront={bringToFront}
          handleDeleteSelected={handleDeleteSelected} elements={elements} queueSave={queueSave}
        />
        <WhiteboardCanvas
          elements={elements} selectedId={selectedId} activeMode={activeMode}
          editingTextId={editingTextId} tempTextValue={tempTextValue} setTempTextValue={setTempTextValue}
          finalizeTextEdit={finalizeTextEdit} color={color} handleTextDoubleClick={handleTextDoubleClick}
          svgRef={svgRef} handlePointerDown={handlePointerDown} handlePointerMove={handlePointerMove} handlePointerUp={handlePointerUp}
        />
      </div>
    </>
  );
}

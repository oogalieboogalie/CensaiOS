import React from 'react';
import {
  addOrReplaceObject,
  makeStudioObject,
  moveObject,
  updateDraftObject,
} from './model.js';

export function ImageStudioCanvas({
  state,
  setCanvasState,
  tool,
  color,
  strokeWidth,
  textValue,
}) {
  const svgRef = React.useRef(null);
  const draftRef = React.useRef(null);
  const moveRef = React.useRef(null);
  const [draft, setDraft] = React.useState(null);

  const pointForEvent = React.useCallback((event) => {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 1000,
      y: ((event.clientY - rect.top) / rect.height) * 650,
    };
  }, []);

  const selectObject = React.useCallback((id) => {
    setCanvasState({ ...state, selectedObjectId: id }, { history: false });
  }, [setCanvasState, state]);

  const onPointerDown = React.useCallback((event) => {
    const point = pointForEvent(event);
    const objectId = event.target.dataset?.objectId;
    if (tool === 'select') {
      selectObject(objectId || null);
      if (objectId) {
        moveRef.current = { point, objects: state.objects, baseState: state, latestState: state };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
      return;
    }

    if (tool === 'text') {
      setCanvasState(addOrReplaceObject(state, makeStudioObject('text', point, {
        color,
        strokeWidth,
        text: textValue,
      })));
      return;
    }

    const nextDraft = makeStudioObject(tool, point, { color, strokeWidth });
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [color, pointForEvent, selectObject, setCanvasState, state, strokeWidth, textValue, tool]);

  const onPointerMove = React.useCallback((event) => {
    const point = pointForEvent(event);
    if (moveRef.current && state.selectedObjectId) {
      const dx = point.x - moveRef.current.point.x;
      const dy = point.y - moveRef.current.point.y;
      const nextState = {
        ...state,
        objects: moveRef.current.objects.map(object =>
          object.id === state.selectedObjectId ? moveObject(object, dx, dy) : object
        ),
      };
      moveRef.current.latestState = nextState;
      setCanvasState(nextState, { history: false });
      return;
    }

    if (!draftRef.current) return;
    const nextDraft = updateDraftObject(draftRef.current, point);
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }, [pointForEvent, setCanvasState, state]);

  const onPointerUp = React.useCallback(() => {
    if (moveRef.current) {
      const move = moveRef.current;
      moveRef.current = null;
      setCanvasState(move.latestState || state, { historyState: move.baseState });
      return;
    }
    if (draftRef.current) {
      setCanvasState(addOrReplaceObject(state, draftRef.current));
      draftRef.current = null;
      setDraft(null);
    }
  }, [setCanvasState, state]);

  const visibleObjects = draft ? [...state.objects, draft] : state.objects;

  return (
    <div style={{ flex: 1, minHeight: 0, border: '1px solid var(--hairline)', borderRadius: 8, background: '#050608', overflow: 'hidden' }}>
      <svg
        ref={svgRef}
        viewBox="0 0 1000 650"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: tool === 'select' ? 'default' : 'crosshair' }}
      >
        <rect x="0" y="0" width="1000" height="650" fill="#050608" />
        {visibleObjects.length === 0 && (
          <text x="500" y="325" fill="var(--ink-faint)" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="28" letterSpacing="6">
            DRAW HERE
          </text>
        )}
        {visibleObjects.map(object => (
          <StudioObject key={object.id} object={object} selected={object.id === state.selectedObjectId} />
        ))}
      </svg>
    </div>
  );
}

function StudioObject({ object, selected }) {
  const common = {
    'data-object-id': object.id,
    stroke: object.color,
    strokeWidth: object.strokeWidth,
    fill: object.fill || 'none',
    vectorEffect: 'non-scaling-stroke',
  };
  const ring = selected ? <rect x={boundsX(object)} y={boundsY(object)} width={boundsW(object)} height={boundsH(object)} fill="none" stroke="var(--accent)" strokeDasharray="8 6" strokeWidth="2" /> : null;

  if (object.type === 'path') {
    return <g>{ring}<polyline {...common} points={object.points.map(p => `${p.x},${p.y}`).join(' ')} /></g>;
  }
  if (object.type === 'rect') {
    const x = Math.min(object.x, object.x + object.w);
    const y = Math.min(object.y, object.y + object.h);
    return <g>{ring}<rect {...common} x={x} y={y} width={Math.abs(object.w)} height={Math.abs(object.h)} /></g>;
  }
  if (object.type === 'ellipse') return <g>{ring}<ellipse {...common} cx={object.x + object.w / 2} cy={object.y + object.h / 2} rx={Math.abs(object.w / 2)} ry={Math.abs(object.h / 2)} /></g>;
  if (object.type === 'line') return <g>{ring}<line {...common} x1={object.x1} y1={object.y1} x2={object.x2} y2={object.y2} /></g>;
  if (object.type === 'text') return <g>{ring}<text data-object-id={object.id} x={object.x} y={object.y} fill={object.color} fontSize={object.fontSize} fontFamily="var(--font-sans)">{object.text}</text></g>;
  if (object.type === 'image') return <g>{ring}<image data-object-id={object.id} href={object.src} x={object.x} y={object.y} width={object.w} height={object.h} preserveAspectRatio="xMidYMid meet" /></g>;
  return null;
}

function boundsX(object) { return Math.min(object.x ?? object.x1 ?? 0, (object.x ?? object.x2 ?? 0) + (object.w ?? 0)) - 8; }
function boundsY(object) { return Math.min(object.y ?? object.y1 ?? 0, (object.y ?? object.y2 ?? 0) + (object.h ?? 0)) - 8; }
function boundsW(object) { return Math.abs(object.w ?? ((object.x2 ?? 0) - (object.x1 ?? 0))) + 16; }
function boundsH(object) { return Math.abs(object.h ?? ((object.y2 ?? 0) - (object.y1 ?? 0))) + 16; }

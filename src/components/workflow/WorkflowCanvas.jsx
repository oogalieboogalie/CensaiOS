/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WorkflowNode } from './WorkflowNode.jsx';
import { NODE_H, NODE_W, fitView, portSpot, wirePath } from './nodeLook.js';

// The board can be zoomed, and this window zooms with it: turn screen
// pixels back into the workflow canvas's own pixels.
function scaleOf(el) {
  if (!el || !el.offsetWidth) return 1;
  return el.getBoundingClientRect().width / el.offsetWidth || 1;
}

/**
 * The node canvas inside a Workflow window. Drag a step by its body to move
 * it, drag from the dot on its right edge to another step to join them,
 * drag empty space to look around, and pick a step to remove its lines with
 * the dot on each one.
 */
export function WorkflowCanvas({ flow, selected, onSelect, agentName, armed, fitSignal = 0 }) {
  const { graph, run } = flow;
  const ref = React.useRef(null);
  const [view, setView] = React.useState({ x: 0, y: 0, k: 1 });

  // Open (and Fit) with every step in sight; the wheel zooms in and out.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (el?.clientWidth) setView(fitView(graph.nodes, el.clientWidth, el.clientHeight));
  }, [fitSignal]);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const s = scaleOf(el);
      const px = (e.clientX - rect.left) / s;
      const py = (e.clientY - rect.top) / s;
      setView((v) => {
        const k = Math.min(1.6, Math.max(0.35, v.k * (e.deltaY > 0 ? 0.9 : 1.1)));
        return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const [drag, setDrag] = React.useState(null);
  const [wire, setWire] = React.useState(null);
  const results = run?.nodes || {};

  const local = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const s = scaleOf(ref.current);
    return { x: ((e.clientX - rect.left) / s - view.x) / view.k, y: ((e.clientY - rect.top) / s - view.y) / view.k };
  };

  const capture = (e) => { e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId); };

  const startNodeDrag = (e, node) => {
    if (e.button || e.target.closest('button, input, textarea, select, [data-wf-port]')) return;
    capture(e);
    onSelect(node.id);
    const at = local(e);
    setDrag({ kind: 'node', id: node.id, dx: at.x - node.x, dy: at.y - node.y, x: node.x, y: node.y });
  };
  const startWire = (e, node, port = null) => {
    if (e.button) return;
    capture(e);
    setWire({ from: node.id, port, start: portSpot(node, 'out', port), end: local(e) });
  };
  const startPan = (e) => {
    if (e.button || e.target !== e.currentTarget) return;
    capture(e);
    onSelect(null);
    setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
  };

  const onMove = (e) => {
    if (!drag && !wire) return;
    e.stopPropagation();
    if (wire) { setWire({ ...wire, end: local(e) }); return; }
    if (drag.kind === 'pan') {
      const s = scaleOf(ref.current);
      setView({ ...view, x: drag.vx + (e.clientX - drag.sx) / s, y: drag.vy + (e.clientY - drag.sy) / s });
      return;
    }
    const at = local(e);
    setDrag({ ...drag, x: at.x - drag.dx, y: at.y - drag.dy });
  };

  const onUp = (e) => {
    if (!drag && !wire) return;
    e.stopPropagation();
    if (wire) {
      const target = document.elementFromPoint?.(e.clientX, e.clientY)?.closest?.('[data-wf-node]');
      const to = target?.getAttribute('data-wf-node');
      if (to && to !== wire.from) flow.connect(wire.from, to, wire.port);
      setWire(null);
      return;
    }
    if (drag.kind === 'node') {
      const node = graph.nodes.find((n) => n.id === drag.id);
      if (node && (Math.abs(node.x - drag.x) > 1 || Math.abs(node.y - drag.y) > 1)) flow.moveNode(drag.id, drag.x, drag.y);
    }
    setDrag(null);
  };

  const placed = (node) => (drag?.kind === 'node' && drag.id === node.id ? { ...node, x: drag.x, y: drag.y } : node);
  const nodes = graph.nodes.map(placed);
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const runningInto = (edge) => results[edge.to]?.status === 'running' && results[edge.from]?.status === 'done';
  const carried = (edge) => results[edge.from]?.status === 'done' && ['done', 'running', 'waiting'].includes(results[edge.to]?.status);

  return (
    <div ref={ref} className="hb-wf-canvas" data-panning={drag?.kind === 'pan' ? 'true' : 'false'}
      onPointerDown={startPan} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <div className="hb-wf-layer" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <svg className="hb-wf-wires" width="1" height="1" aria-hidden="true">
          {graph.edges.map((edge) => {
            const a = byId[edge.from];
            const b = byId[edge.to];
            if (!a || !b) return null;
            const from = portSpot(a, 'out', a.type === 'branch' ? edge.port || 'yes' : null);
            const to = portSpot(b, 'in');
            return (
              <path key={edge.id} d={wirePath(from, to)} className="hb-wf-wire"
                data-live={runningInto(edge) ? 'true' : 'false'} data-carried={carried(edge) ? 'true' : 'false'} data-port={edge.port || undefined} />
            );
          })}
          {wire && <path d={wirePath(wire.start, wire.end)} className="hb-wf-wire" data-drawing="true" />}
        </svg>
        {graph.edges.map((edge) => {
          const a = byId[edge.from];
          const b = byId[edge.to];
          // Only the selected step's lines offer a remove dot, so close steps stay tidy.
          if (!a || !b || (selected !== a.id && selected !== b.id)) return null;
          const from = portSpot(a, 'out', a.type === 'branch' ? edge.port || 'yes' : null);
          const to = portSpot(b, 'in');
          return (
            <button key={edge.id} type="button" className="hb-wf-cut" aria-label="Remove this line" title="Remove this line"
              style={{ left: (from.x + to.x) / 2 - 7, top: (from.y + to.y) / 2 - 7 }}
              onPointerDown={(e) => e.stopPropagation()} onClick={() => flow.removeEdge(edge.id)}>×</button>
          );
        })}
        {nodes.map((node) => (
          <WorkflowNode key={node.id} node={node} result={results[node.id]} selected={selected === node.id}
            agentName={agentName(node.agentId)} armed={armed} runId={run?.id}
            onPointerDown={(e) => startNodeDrag(e, node)} onWire={(e, port) => startWire(e, node, port)}
            onReview={flow.review} style={{ left: node.x, top: node.y, width: NODE_W, minHeight: NODE_H }} />
        ))}
      </div>
    </div>
  );
}

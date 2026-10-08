// Spec 9 sketch actions, shared by the canvas selection bar and the
// Sketchpad: hand a sketch to a chat, make it real as a module, or move
// canvas ink into a Sketchpad. Everything goes through the workspace store,
// so the results sync to the board like any other window.
import { useWorkspaceStore } from '../store.js';
import { getAgentById } from '../agentStore.js';
import { getModelCapabilities } from '../chat/modelCapabilities.js';
import { newModuleWindowProps } from '../modules/moduleWindowState.js';
import { getCollaborationClientId } from '../collaboration/clientIdentity.js';
import { sceneToPng } from './rasterize.js';
import { strokeBounds } from './stroke.js';

export const MAKE_REAL_REQUEST = 'Make this sketch real: a working module that matches the drawing.';
const GAP = 48;

function agentOf(win) {
  return getAgentById(win.agentId || 'censai') || null;
}

/** Chat windows on the board, and whether each one's model can see images. */
export function chatTargets(wins) {
  return (wins || []).filter((w) => w.kind === 'chat' || w.type === 'chat').map((w) => {
    const agent = agentOf(w);
    const provider = agent?.model_provider || agent?.modelProvider || null;
    const caps = getModelCapabilities(provider, agent?.model_name || agent?.modelName || '');
    // No provider on the record means the server's default model: the chat
    // itself checks that one once the image is attached.
    return { id: w.id, title: w.title || agent?.name || 'Chat', agentName: agent?.name || 'Censai', canSee: Boolean(caps.image) || !provider };
  });
}

/** Attach the sketch to a chat's composer and bring that chat forward. */
export function attachToChat(chatId, dataUrl) {
  const store = useWorkspaceStore.getState();
  store.onUpdate(chatId, { imageAttachment: dataUrl });
  store.setActiveId(chatId);
}

export function newChatWithSketch(dataUrl, bounds) {
  const store = useWorkspaceStore.getState();
  const pos = bounds ? { x: bounds.x + bounds.w + GAP, y: bounds.y } : null;
  return store.spawnAt('chat', { agentId: 'censai', imageAttachment: dataUrl }, pos);
}

/**
 * Start a module build beside the sketch. `sketch` says where the drawing
 * lives ({ pathIds } on the board or { windowId } for a Sketchpad), so the
 * build can re-read it and the board can draw the link line.
 */
export function makeReal(sketch, bounds) {
  const store = useWorkspaceStore.getState();
  const pos = bounds ? { x: bounds.x + bounds.w + GAP * 2, y: bounds.y } : null;
  return store.spawnAt('module', { ...newModuleWindowProps(MAKE_REAL_REQUEST, getCollaborationClientId()), sketch }, pos);
}

/** The strokes or Sketchpad elements a module's `sketch` points at. */
export function sketchScene(sketch, state = useWorkspaceStore.getState()) {
  if (!sketch) return null;
  if (Array.isArray(sketch.pathIds)) {
    const ids = new Set(sketch.pathIds);
    const strokes = (state.paths || []).filter((p) => ids.has(p.id));
    return strokes.length ? { strokes } : null;
  }
  if (sketch.windowId) {
    const win = (state.wins || []).find((w) => w.id === sketch.windowId);
    const elements = win?.state?.excalidraw?.elements;
    return Array.isArray(elements) && elements.length ? { elements } : null;
  }
  return null;
}

export async function sketchImage(sketch) {
  const scene = sketchScene(sketch);
  return scene ? sceneToPng(scene) : null;
}

/** Canvas ink as Sketchpad pencil elements, moved into the window's frame. */
export function strokesToSketchpadElements(strokes, { offsetX = 32, offsetY = 64 } = {}) {
  const b = strokeBounds(strokes);
  if (!b) return [];
  const scale = Math.min(1, 720 / Math.max(b.w, 1), 480 / Math.max(b.h, 1));
  return strokes.map((s) => {
    const pts = s.pts.map((pt) => ({ ...pt, x: offsetX + (pt.x - b.x) * scale, y: offsetY + (pt.y - b.y) * scale }));
    return {
      id: crypto.randomUUID(), type: 'pencil', x: pts[0].x, y: pts[0].y, pts,
      color: s.color || 'var(--accent)', strokeWidth: Math.max(1, ((s.size || 4) * scale) / 1.6), pen: !s.sim,
    };
  });
}

export function sendToSketchpad(strokes) {
  const b = strokeBounds(strokes);
  const store = useWorkspaceStore.getState();
  const elements = strokesToSketchpadElements(strokes);
  const pos = b ? { x: b.x + b.w + GAP, y: b.y } : null;
  return store.spawnAt('sketchpad', { title: 'Sketchpad', state: { excalidraw: { elements } } }, pos);
}

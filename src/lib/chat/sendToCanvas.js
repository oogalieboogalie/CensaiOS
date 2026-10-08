import { useWorkspaceStore } from '../store.js';
import { windowForArtifact } from './artifacts.js';

const GAP = 40;

/**
 * Spec 3 "Send to canvas": open an artifact as a real window beside the chat
 * it came from and draw a link line between the two. Returns the new id.
 */
export function sendToCanvas(sourceWinId, artifact) {
  const store = useWorkspaceStore.getState();
  const { kind, props, size } = windowForArtifact(artifact);
  const source = store.wins.find(w => w.id === sourceWinId);
  // Stack later sends below earlier ones so they don't land on each other.
  const linked = source
    ? store.links.filter(l => l.fromId === source.id).length
    : 0;
  const pos = source
    ? { x: source.x + (source.w || 0) + GAP, y: source.y + linked * (GAP / 2) }
    : null;
  const id = store.spawnAt(kind, props, pos, size);
  if (source && id) store.createLink(source.id, id);
  return id;
}

/** Branch: a new chat window with the same agent and the conversation up to a message. */
export function branchChat(sourceWin, msgs, upToIndex) {
  const store = useWorkspaceStore.getState();
  const kept = (msgs || []).slice(0, upToIndex + 1).filter(m => !m.hidden);
  const source = store.wins.find(w => w.id === sourceWin?.id) || sourceWin;
  const pos = source && Number.isFinite(source.x)
    ? { x: source.x + (source.w || 0) + GAP, y: source.y + GAP }
    : null;
  const size = source?.w && source?.h ? { w: source.w, h: source.h } : null;
  const id = store.spawnAt('chat', { agentId: sourceWin?.agentId, msgs: kept, title: 'Branch' }, pos, size);
  if (source?.id && id) store.createLink(source.id, id);
  return id;
}

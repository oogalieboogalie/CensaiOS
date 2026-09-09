import { useWorkspaceStore } from '../../lib/store.js';

export function resolveLinkedPreviewSource(win = {}, sourceWindow = null) {
  const linked = Boolean(win.sourceWindowId && sourceWindow?.kind === 'code_editor');
  const sourceHtml = linked && typeof sourceWindow.code === 'string'
    ? sourceWindow.code
    : null;

  return {
    html: sourceHtml ?? win.html ?? '',
    linked,
    missing: Boolean(win.sourceWindowId && !linked),
    label: linked
      ? (sourceWindow.fileName || sourceWindow.title || 'Code Editor')
      : (win.fileName || 'preview.html'),
  };
}

export function useLinkedPreviewSource(win = {}) {
  const sourceWindow = useWorkspaceStore((state) => (
    win.sourceWindowId
      ? state.wins.find((candidate) => candidate.id === win.sourceWindowId) || null
      : null
  ));
  return resolveLinkedPreviewSource(win, sourceWindow);
}

import { useWorkspaceStore } from '../../lib/store.js';

export function useAppActions() {
  const store = useWorkspaceStore();
  
  return {
    spawnAt: store.spawnAt,
    spawnGroup: store.spawnGroup,
    onUpdate: store.onUpdate,
    onUpdateGroup: store.onUpdateGroup,
    resizeGroup: store.resizeGroup,
    deleteWindows: store.deleteWindows,
    onCloseGroup: store.onCloseGroup,
    onClose: store.onClose,
    createAgent: store.createAgent,
  };
}

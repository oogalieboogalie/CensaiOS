import { useWorkspaceStore } from '../../lib/store.js';

export function useAppPresets() {
  const store = useWorkspaceStore();

  return {
    saveAsPreset: store.saveAsPreset,
    loadPreset: store.loadPreset,
    deletePreset: store.deletePreset,
    saveGroupPreset: store.saveGroupPreset,
    loadGroupPreset: store.loadGroupPreset,
    deleteGroupPreset: store.deleteGroupPreset,
    setGroupDefaultPreset: store.setGroupDefaultPreset,
    autoArrangeGroup: store.autoArrangeGroup
  };
}

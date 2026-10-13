import { create } from 'zustand';

// Whether the Board history panel is open (toggled from the dock's History button).
export const useHistoryPanelStore = create((set) => ({
  open: false,
  setOpen: (open) => set({ open: Boolean(open) }),
}));

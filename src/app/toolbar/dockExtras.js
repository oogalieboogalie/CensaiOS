// Extra dock pieces live in toolbar/extras/*.jsx and load themselves.
// Vite fills the glob. Jest has no glob, so the dock stays the base tools.

export function loadDockExtras() {
  try {
    return Object.values(import.meta.glob('./extras/*.jsx', { eager: true }));
  } catch {
    return [];
  }
}

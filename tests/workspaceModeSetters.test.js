import { useWorkspaceStore } from '../src/lib/store.js';

// Regression: setFocusMode/setPenMode must accept updater functions like the
// other mode setters (selectedIds, dockOffset). Storing the function itself
// leaves a truthy non-boolean in state, which pins the mode visually on.
describe('workspace mode setters', () => {
  test('setFocusMode accepts booleans and updater functions', () => {
    const { setFocusMode } = useWorkspaceStore.getState();
    setFocusMode(false);
    expect(useWorkspaceStore.getState().focusMode).toBe(false);
    setFocusMode((f) => !f);
    expect(useWorkspaceStore.getState().focusMode).toBe(true);
    setFocusMode((f) => !f);
    expect(useWorkspaceStore.getState().focusMode).toBe(false);
    setFocusMode(true);
    expect(useWorkspaceStore.getState().focusMode).toBe(true);
    setFocusMode(false);
  });

  test('setPenMode accepts booleans and updater functions', () => {
    const { setPenMode } = useWorkspaceStore.getState();
    setPenMode(false);
    expect(useWorkspaceStore.getState().penMode).toBe(false);
    setPenMode((p) => !p);
    expect(useWorkspaceStore.getState().penMode).toBe(true);
    setPenMode(false);
  });
});

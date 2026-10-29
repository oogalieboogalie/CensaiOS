/**
 * Whether the server has every board edit this tab made. The shared board
 * (useYjsCanvas) calls `edited()` when this tab changes the board and
 * `saved()` once the server has confirmed all of it; the browser copy of an
 * unsaved board (useWorkspacePersistence) is kept only while `unsaved` and
 * dropped from the `onSaved` listeners.
 */
export function createBoardSaves() {
  let unsaved = false;
  const listeners = new Set();
  return {
    get unsaved() { return unsaved; },
    edited() { unsaved = true; },
    saved() {
      if (!unsaved) return;
      unsaved = false;
      for (const listener of [...listeners]) listener();
    },
    onSaved(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

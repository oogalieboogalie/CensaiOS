// The editor's own load-then-autosave loop from its index.html: open the
// saved scene, then save the whole project a second after each change. Its
// storage is the board here (boardStorage.js), so "saved" means shared.

const CHANGE_SIGNALS = [
  'cameraResetted', 'geometryChanged', 'objectAdded', 'objectChanged', 'objectRemoved',
  'materialChanged', 'sceneBackgroundChanged', 'sceneEnvironmentChanged', 'sceneFogChanged',
  'sceneGraphChanged', 'scriptChanged', 'historyChanged',
];

export function startAutosave(editor) {
  editor.storage.init(() => {
    editor.storage.get(async (state) => {
      if (state !== undefined) await editor.fromJSON(state);
      else editor.signals.sceneEnvironmentChanged.dispatch('Default');
      const selected = editor.config.getKey('selected');
      if (selected !== undefined) editor.selectByUuid(selected);
    });

    let timeout;
    function saveState() {
      if (editor.config.getKey('autosave') === false) return;
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        editor.signals.savingStarted.dispatch();
        timeout = setTimeout(() => {
          editor.storage.set(editor.toJSON());
          editor.signals.savingFinished.dispatch();
        }, 100);
      }, 1000);
    }
    for (const name of CHANGE_SIGNALS) editor.signals[name].add(saveState);
  });
}

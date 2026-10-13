// Stands in for the editor's Storage.js (IndexedDB, which a sealed module
// can't open). The editor already autosaves its whole project a second after
// each change; here that save goes to the board through the Module SDK, so
// everyone on the board has the same scene. A teammate's save arrives as a
// storage change and is loaded in place, keeping your own camera and
// selection. Two people editing at once: the last save wins, whole scene.
import { SCENE_KEY, fitsOnBoard, packScene, sceneContent, unpackScene } from './scenePack.js';

const sdk = () => window.censai;
const state = { editor: null, last: '', pending: null, applying: false, pointerDown: false, warned: false };

function toast(message) { sdk()?.toast(message); }

async function save(json) {
  const content = sceneContent(json);
  if (content === state.last || state.applying) return;
  state.last = content;
  const record = await packScene(json);
  if (!fitsOnBoard(record)) {
    if (!state.warned) toast(`This scene is too big to keep on the board (${Math.round(record.bytes / 1024)} KB packed, 240 KB at most). Use File > Export to save it as a file.`);
    state.warned = true;
    return;
  }
  state.warned = false;
  try {
    await sdk().storage.set(SCENE_KEY, { ...record, at: Date.now() });
  } catch (err) {
    state.last = '';
    toast(`Not saved to the board: ${err?.message || err}`);
  }
}

/** The editor's storage, kept on the board. */
export function Storage() {
  return {
    init(callback) { callback(); },
    get(callback) {
      unpackScene(sdk()?.storage.get(SCENE_KEY)).then((json) => {
        if (json) state.last = sceneContent(json);
        callback(json || undefined);
      }, () => { toast('The scene saved on the board could not be read.'); callback(undefined); });
    },
    set(json) { save(json); },
    // "New" clears the editor; the empty scene is saved by the autosave that follows.
    clear() {},
  };
}

async function applyRemote(record) {
  const editor = state.editor;
  const json = await unpackScene(record).catch(() => null);
  if (!editor || !json || sceneContent(json) === state.last) return;
  const selected = editor.selected?.uuid;
  const view = { camera: editor.camera.toJSON(), controls: editor.controls?.toJSON?.() };
  state.applying = true;
  try {
    state.last = sceneContent(json);
    editor.clear();
    await editor.fromJSON({ ...json, ...view, history: undefined });
    if (selected) editor.selectByUuid(selected);
  } finally {
    state.applying = false;
  }
}

function onBoardChange(key, record) {
  if (key !== SCENE_KEY) return;
  // Mid-drag, a reload would yank the object out of your hand: wait for the drop.
  if (state.pointerDown) { state.pending = record; return; }
  applyRemote(record);
}

/** Start following the board once the editor exists. */
export function connectBoard(editor) {
  state.editor = editor;
  sdk()?.storage.onChange(onBoardChange);
  document.addEventListener('pointerdown', () => { state.pointerDown = true; }, true);
  document.addEventListener('pointerup', () => {
    state.pointerDown = false;
    if (state.pending) { const record = state.pending; state.pending = null; applyRemote(record); }
  }, true);
}

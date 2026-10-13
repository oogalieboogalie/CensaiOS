// Keeps one Excalidraw scene and the board in step. Your changes go to the
// board shape by shape (a short pause collects a drag into one write);
// anyone else's changes come back the same way and are merged in without
// touching your undo history.
import React from 'react';
import {
  MAX_ELEMENTS, boardIsAhead, elementsPatch, filesPatch, liveElements, readDiagram, reconcile, rememberBoard,
} from '../../../lib/yorware/diagramModel.js';

const WRITE_PAUSE_MS = 120;

export function useDiagramSync(win, onUpdate, { CaptureUpdateAction } = {}) {
  const board = React.useMemo(() => readDiagram(win), [win]);
  const [api, setApi] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const known = React.useRef(new Map());
  const latest = React.useRef(null);
  const timer = React.useRef(null);
  const boardRef = React.useRef(board);
  boardRef.current = board;
  const lastBg = React.useRef(board.background);

  const flush = React.useCallback(() => {
    timer.current = null;
    const next = latest.current;
    if (!next) return;
    latest.current = null;
    const { elements, appState, files } = next;
    if (liveElements(elements).length > MAX_ELEMENTS) {
      setNotice(`This diagram has more than ${MAX_ELEMENTS} shapes, so new ones are not being saved to the board. Start a second diagram.`);
      return;
    }
    const { patch } = elementsPatch(elements, known.current);
    const pics = filesPatch(files, boardRef.current.files);
    Object.assign(patch, pics.patch);
    if (pics.tooBig.length) setNotice('A picture over 2 MB stays on your screen only. Shrink it to share it on the board.');
    const bg = appState?.viewBackgroundColor;
    if (bg && bg !== lastBg.current && bg !== boardRef.current.background) {
      patch.dgBg = bg;
      lastBg.current = bg;
    }
    if (Object.keys(patch).length) onUpdate?.(patch);
  }, [onUpdate]);

  const onChange = React.useCallback((elements, appState, files) => {
    latest.current = { elements, appState, files };
    if (!timer.current) timer.current = setTimeout(flush, WRITE_PAUSE_MS);
  }, [flush]);

  // Save anything still waiting when the window closes.
  React.useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); flush(); } }, [flush]);

  // Bring in what others changed.
  React.useEffect(() => {
    rememberBoard(known.current, board.elements);
    if (!api) return;
    const missing = Object.values(board.files).filter((f) => !api.getFiles()[f.id]);
    if (missing.length) api.addFiles(missing);
    const scene = api.getSceneElementsIncludingDeleted();
    const appState = {};
    if (board.background && board.background !== api.getAppState().viewBackgroundColor) {
      appState.viewBackgroundColor = board.background;
      lastBg.current = board.background;
    }
    const ahead = boardIsAhead(scene, board.elements);
    if (!ahead && !Object.keys(appState).length) return;
    api.updateScene({
      ...(ahead ? { elements: reconcile(scene, board.elements) } : {}),
      ...(Object.keys(appState).length ? { appState } : {}),
      captureUpdate: CaptureUpdateAction?.NEVER ?? 'NEVER',
    });
  }, [api, board, CaptureUpdateAction]);

  const initialData = React.useMemo(() => ({
    elements: board.elements,
    files: board.files,
    appState: board.background ? { viewBackgroundColor: board.background } : {},
    scrollToContent: true,
  // The scene is seeded once; later board changes arrive through updateScene.
  }), []);

  return { api, setApi, onChange, initialData, notice, setNotice, board };
}

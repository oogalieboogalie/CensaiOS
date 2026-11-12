import React from 'react';
import { screenToCanvas } from '../../lib/canvasMath.js';
import { useWorkspaceStore } from '../../lib/store.js';
import { logToApp } from '../../lib/appLog/browserLog.js';
import {
  dragHasPicture, imageFilesFrom, imageUrlFrom, isTypingTarget, pictureFromFile, titleFor, windowSizeFor,
} from '../../lib/canvasImages.js';

const STACK = 32; // several pictures at once land in a short cascade

// Is this element the empty board itself (not a window or a menu on it)?
function isBoard(el, root) {
  return el === root || Boolean(el?.hasAttribute?.('data-canvas-bg'));
}

/**
 * Paste (Ctrl/Cmd+V) or drop pictures onto the board, each into its own
 * Image window. Paste only fires when the pointer is over empty board and
 * nobody is typing, so text boxes and windows keep their own paste. Drop only
 * takes drops on empty board, so windows that accept files keep theirs.
 */
export function useCanvasImageDrop({ ref, pan, zoom }) {
  const view = React.useRef({ pan, zoom });
  view.current = { pan, zoom };
  const pointer = React.useRef({ x: null, y: null, overBoard: true });

  const openAt = React.useCallback(async (pictures, clientX, clientY, origin) => {
    const root = ref.current;
    if (!root || !pictures.length) return;
    const rect = root.getBoundingClientRect();
    const cx = Number.isFinite(clientX) ? clientX : rect.left + rect.width / 2;
    const cy = Number.isFinite(clientY) ? clientY : rect.top + rect.height / 2;
    const { pan: p, zoom: z } = view.current;
    const at = screenToCanvas(cx, cy, p.x, p.y, z, rect);
    const { spawnAt } = useWorkspaceStore.getState();
    pictures.forEach((pic, i) => {
      const size = windowSizeFor(pic.width, pic.height);
      const pos = { x: Math.round(at.x - size.w / 2 + i * STACK), y: Math.round(at.y - size.h / 2 + i * STACK) };
      spawnAt('image', { title: pic.title, src: pic.src, origin }, pos, size);
    });
  }, [ref]);

  const readFiles = React.useCallback(async (files) => {
    const out = [];
    for (const file of files) {
      try {
        const pic = await pictureFromFile(file);
        if (pic) out.push({ ...pic, title: titleFor(file) });
        else logToApp('warn', 'Board: a pasted picture was too big to keep', { detail: `${file.type}, ${file.size} bytes`, where: 'canvas' });
      } catch (err) {
        logToApp('warn', 'Board: could not read a pasted picture', { detail: `${file.type}: ${err?.message || 'unknown error'}`, where: 'canvas' });
      }
    }
    return out;
  }, []);

  React.useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;

    const onMove = (e) => { pointer.current = { x: e.clientX, y: e.clientY, overBoard: isBoard(e.target, root) }; };
    const onLeave = () => { pointer.current = { x: null, y: null, overBoard: true }; };

    const onPaste = (e) => {
      if (e.defaultPrevented || isTypingTarget(document.activeElement) || isTypingTarget(e.target)) return;
      if (!pointer.current.overBoard) return; // over a window: its paste, not ours
      const files = imageFilesFrom(e.clipboardData);
      if (!files.length) return;
      e.preventDefault();
      const { x, y } = pointer.current;
      readFiles(files).then((pics) => openAt(pics, x, y, 'pasted'));
    };

    const onDragOver = (e) => {
      if (!isBoard(e.target, root) || !dragHasPicture(e.dataTransfer)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };

    const onDrop = (e) => {
      if (e.defaultPrevented || !isBoard(e.target, root)) return;
      const files = imageFilesFrom(e.dataTransfer);
      const url = files.length ? null : imageUrlFrom(e.dataTransfer);
      if (!files.length && !url) return;
      e.preventDefault();
      const { clientX, clientY } = e;
      if (url) {
        openAt([{ src: url, title: 'Picture', width: 0, height: 0 }], clientX, clientY, 'dropped');
        return;
      }
      readFiles(files).then((pics) => openAt(pics, clientX, clientY, 'dropped'));
    };

    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerleave', onLeave);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('drop', onDrop);
    document.addEventListener('paste', onPaste);
    return () => {
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('dragover', onDragOver);
      root.removeEventListener('drop', onDrop);
      document.removeEventListener('paste', onPaste);
    };
  }, [ref, openAt, readFiles]);
}

import React from 'react';
import { fileLoadMessage, readFileLoad, warnFileLoadFailed } from '../files/fileLoad.js';
import { useFileLoadGate } from '../files/useFileLoadGate.js';
import { staysOffBoard } from '../../../shared/files/fileProblems.js';

const codeContentCache = new Map();
const KIND = 'code_editor';

function fileUrl(win) {
  return win.isGithub
    ? `/api/github/file?repo=${encodeURIComponent(win.githubRepo)}&path=${encodeURIComponent(win.filePath)}`
    : `/api/files/content?path=${encodeURIComponent(win.filePath)}`;
}

export function useCodeFileLoad(win, setCode, onUpdate) {
  const gate = useFileLoadGate(win.filePath);
  const onUpdateRef = React.useRef(onUpdate);
  const settleRef = React.useRef(gate.settle);
  const sharedCodeRef = React.useRef(win.code);
  const heldRef = React.useRef(false); // words of a file only the owner opens are showing
  onUpdateRef.current = onUpdate;
  settleRef.current = gate.settle;
  sharedCodeRef.current = win.code;
  const { attempt } = gate;

  React.useEffect(() => {
    // Moving to another file first drops the words of one only the owner
    // opens, so they never sit on screen once the board may get them.
    if (heldRef.current) {
      heldRef.current = false;
      setCode('');
    }
    if (!win.filePath) return undefined;
    const url = fileUrl(win);
    // Local files are read fresh every time: an agent or a terminal may
    // have changed them since this browser last looked.
    if (win.isGithub && codeContentCache.has(url)) {
      const cached = codeContentCache.get(url);
      setCode(cached);
      onUpdateRef.current?.({ code: cached });
      settleRef.current('ready');
      return undefined;
    }
    let cancelled = false;
    fetch(url).then(async (res) => {
      const loaded = await readFileLoad(res);
      if (cancelled) return;
      if (!loaded.ok) {
        // Nothing the board may still hold of a file only the owner opens
        // shows here, and that copy is emptied for everyone.
        if (staysOffBoard(loaded.reason)) {
          setCode('');
          if (sharedCodeRef.current) onUpdateRef.current?.({ code: '' });
        }
        settleRef.current('failed', loaded.message, loaded.reason);
        warnFileLoadFailed(KIND, loaded.status, loaded.reason);
        return;
      }
      const next = loaded.content || '';
      if (loaded.ownerOnly) {
        // Only this computer's owner may read it, so its words stay on this
        // screen: the board's copy is emptied, never filled.
        heldRef.current = true;
        setCode(next);
        settleRef.current('ready', '', 'ownerOnly');
        if (sharedCodeRef.current) onUpdateRef.current?.({ code: '' });
        return;
      }
      codeContentCache.set(url, next);
      setCode(next);
      onUpdateRef.current?.({ code: next });
      settleRef.current('ready');
    }).catch(() => {
      if (cancelled) return;
      settleRef.current('failed', fileLoadMessage(0));
      warnFileLoadFailed(KIND, 0);
    });
    return () => { cancelled = true; };
    // onUpdate and settle are read through refs so a new identity does not
    // refetch; `attempt` changes on "Try again", so the file is read once more.
  }, [win.filePath, win.isGithub, win.githubRepo, setCode, attempt]);

  return {
    loading: gate.loading,
    loadError: gate.loadError,
    canSave: gate.canSave && !win.isGithub,
    retryLoad: gate.retry,
    offBoard: gate.offBoard,
  };
}

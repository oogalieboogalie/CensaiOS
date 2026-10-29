import React from 'react';
import { fileLoadMessage, readFileLoad, warnFileLoadFailed } from '../files/fileLoad.js';
import { useFileLoadGate } from '../files/useFileLoadGate.js';

// The words of each file read (or saved) in this visit, so a Document opened
// again shows them at once. A file on this computer is still read again, since
// it may have been changed or deleted since; GitHub's copy is kept as it is.
const fileContentCache = new Map();
const KIND = 'doc';

function fileUrl(win) {
  return win.isGithub
    ? `/api/github/file?repo=${encodeURIComponent(win.githubRepo)}&path=${encodeURIComponent(win.filePath)}`
    : `/api/files/content?path=${encodeURIComponent(win.filePath)}`;
}

export function useDocFileLoad(win, setRealContent) {
  const gate = useFileLoadGate(win.filePath);
  const settleRef = React.useRef(gate.settle);
  settleRef.current = gate.settle;
  const { attempt } = gate;

  React.useEffect(() => {
    if (!win.filePath) return undefined;
    const url = fileUrl(win);
    const kept = fileContentCache.get(url);
    if (kept !== undefined) {
      setRealContent(kept);
      settleRef.current('ready');
      if (win.isGithub) return undefined;
    }
    let cancelled = false;
    fetch(url)
      .then((res) => readFileLoad(res))
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded.ok) {
          fileContentCache.delete(url);
          // Words typed onto the kept copy stay on screen to copy, with Save
          // off, until "Try again" reads the file.
          setRealContent((shown) => (kept === undefined || shown === kept ? '' : shown));
          settleRef.current('failed', loaded.message, loaded.reason);
          warnFileLoadFailed(KIND, loaded.status, loaded.reason);
          return;
        }
        fileContentCache.set(url, loaded.content);
        // Words typed since the kept copy showed are not replaced, so a Save
        // made then writes them over any newer words the file got, as it
        // would have without the kept copy; this read is the only gap.
        setRealContent((shown) => (kept === undefined || shown === kept ? loaded.content : shown));
        settleRef.current('ready');
      })
      .catch(() => {
        // With the kept copy showing, a read that did not get through changes nothing.
        if (cancelled || kept !== undefined) return;
        setRealContent('');
        settleRef.current('failed', fileLoadMessage(0));
        warnFileLoadFailed(KIND, 0);
      });
    return () => { cancelled = true; };
    // `attempt` changes on "Try again", so the file is read once more.
  }, [win.filePath, win.isGithub, win.githubRepo, setRealContent, attempt]);

  // Saved words are what a Document opened again shows first.
  const rememberSaved = React.useCallback((content) => {
    if (win.filePath && !win.isGithub) fileContentCache.set(fileUrl(win), content);
  }, [win.filePath, win.isGithub, win.githubRepo]);

  return {
    loading: gate.loading,
    loadError: gate.loadError,
    canSave: gate.canSave && !win.isGithub,
    retryLoad: gate.retry,
    rememberSaved,
  };
}

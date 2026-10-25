import React from 'react';
import { fileLoadMessage, readFileLoad, warnFileLoadFailed } from '../files/fileLoad.js';
import { useFileLoadGate } from '../files/useFileLoadGate.js';

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

  React.useEffect(() => {
    if (!win.filePath) return undefined;
    const url = fileUrl(win);
    if (fileContentCache.has(url)) {
      setRealContent(fileContentCache.get(url));
      settleRef.current('ready');
      return undefined;
    }
    let cancelled = false;
    fetch(url)
      .then((res) => readFileLoad(res))
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded.ok) {
          setRealContent('');
          settleRef.current('failed', loaded.message);
          warnFileLoadFailed(KIND, loaded.status);
          return;
        }
        fileContentCache.set(url, loaded.content);
        setRealContent(loaded.content);
        settleRef.current('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setRealContent('');
        settleRef.current('failed', fileLoadMessage(0));
        warnFileLoadFailed(KIND, 0);
      });
    return () => { cancelled = true; };
  }, [win.filePath, win.isGithub, win.githubRepo, setRealContent]);

  return {
    loading: gate.loading,
    loadError: gate.loadError,
    canSave: gate.canSave && !win.isGithub,
  };
}

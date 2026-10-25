import React from 'react';
import { fileLoadMessage, readFileLoad, warnFileLoadFailed } from '../files/fileLoad.js';
import { useFileLoadGate } from '../files/useFileLoadGate.js';

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
  onUpdateRef.current = onUpdate;
  settleRef.current = gate.settle;

  React.useEffect(() => {
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
        settleRef.current('failed', loaded.message);
        warnFileLoadFailed(KIND, loaded.status);
        return;
      }
      const next = loaded.content || '';
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
    // onUpdate and settle are read through refs so a new identity does not refetch.
  }, [win.filePath, win.isGithub, win.githubRepo, setCode]);

  return {
    loading: gate.loading,
    loadError: gate.loadError,
    canSave: gate.canSave && !win.isGithub,
  };
}

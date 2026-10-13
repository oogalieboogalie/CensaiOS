import React from 'react';
import { normalizeProject, starterProject } from '../../../lib/studio/project.js';
import { edits } from '../../../lib/studio/edit.js';

// The project lives on the window record (win.studio) so it syncs to
// everyone on the board like any other window. Edits show at once locally
// and are saved at most every 120 ms, which keeps drags smooth without
// flooding the board with intermediate positions.

const SAVE_MS = 120;

export function useStudio({ win, onUpdate }) {
  const [local, setLocal] = React.useState(null);
  const timer = React.useRef(null);
  const pending = React.useRef(null);
  const remote = win?.studio;
  const project = React.useMemo(() => normalizeProject(local || remote || starterProject()), [local, remote]);
  const projectRef = React.useRef(project);
  projectRef.current = project;
  // The canvas hands a new onUpdate every render; keep the latest without re-running effects.
  const save = React.useRef(onUpdate);
  save.current = onUpdate;

  // A new Studio starts with a short demo song, saved so teammates see the same thing.
  React.useEffect(() => {
    if (!remote) save.current?.({ studio: projectRef.current });
  }, [remote]);

  const flush = React.useCallback(() => {
    clearTimeout(timer.current); timer.current = null;
    const next = pending.current;
    pending.current = null;
    if (next) save.current?.({ studio: next });
    setLocal(null);
  }, []);

  // Closing the window mid-edit still saves the last change.
  React.useEffect(() => () => {
    clearTimeout(timer.current);
    const next = pending.current;
    pending.current = null;
    if (next) save.current?.({ studio: next });
  }, []);

  /** Applies `edits[name](project, ...args)`. */
  const edit = React.useCallback((name, ...args) => {
    const next = edits[name](projectRef.current, ...args);
    projectRef.current = next;
    pending.current = next;
    setLocal(next);
    if (!timer.current) timer.current = setTimeout(flush, SAVE_MS);
  }, [flush]);

  const replace = React.useCallback((raw) => {
    const next = normalizeProject(raw);
    pending.current = next;
    flush();
  }, [flush]);

  return { project, edit, replace, get: () => projectRef.current };
}

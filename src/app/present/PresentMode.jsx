import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import { usePresentStore } from '../../lib/presentStore.js';
import { sceneLabel } from '../../lib/presentScenes.js';
import { usePresentKeys } from './usePresentKeys.js';
import { SceneEditor } from './SceneEditor.jsx';
import { PresenterNotes } from './PresenterNotes.jsx';

// Present mode's on-screen parts: the thin progress line with the scene name,
// the quick fade between scenes, the "no scenes yet" card, the scene editor
// and the presenter notes window. The board keeps running underneath, so
// agents and teammates keep moving during a presentation.

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function useCurrentRun() {
  const scenes = usePresentStore((s) => s.scenes);
  const sceneId = usePresentStore((s) => s.sceneId);
  const canvasGroups = useWorkspaceStore((s) => s.canvasGroups);
  return React.useMemo(() => {
    const run = usePresentStore.getState().run();
    const at = run.findIndex((e) => e.scene.id === sceneId);
    return { run, at, entry: run[at] || null };
  }, [scenes, sceneId, canvasGroups]);
}

function ProgressLine({ run, at, entry }) {
  const [fresh, setFresh] = React.useState(true);
  React.useEffect(() => {
    setFresh(true);
    const t = setTimeout(() => setFresh(false), 2600);
    return () => clearTimeout(t);
  }, [entry?.scene.id]);
  const total = Math.max(1, run.length);
  return (
    <div className="hb-present-progress" data-testid="present-progress" data-fresh={fresh}>
      <div className="hb-present-label" role="status" aria-live="polite">
        <span className="hb-kbd">F{entry.scene.key}</span>
        <span className="hb-present-name">{sceneLabel(entry)}</span>
        <span className="hb-present-count">{at + 1} of {run.length}</span>
      </div>
      <div className="hb-present-track">
        <div className="hb-present-fill" style={{ width: `${((at + 1) / total) * 100}%` }} />
      </div>
    </div>
  );
}

function EmptyNotice() {
  const dismiss = usePresentStore((s) => s.dismissEmpty);
  const openEditor = usePresentStore((s) => s.setEditorOpen);
  return (
    <div className="hb-present-empty" role="dialog" aria-label="No scenes yet" data-testid="present-empty">
      <strong>Nothing to present yet</strong>
      <p>
        Each scene shows the group on its F-key. Click a window in a group and press Alt+1 to 9
        (Ctrl in the desktop app) to put it on a key, or pick a board area for a scene.
      </p>
      <div className="hb-present-row">
        <button type="button" className="hb-present-btn" data-primary onClick={() => openEditor(true)}>Edit scenes</button>
        <button type="button" className="hb-present-btn" onClick={dismiss}>Close</button>
      </div>
    </div>
  );
}

export function PresentMode({ workspaceId }) {
  usePresentKeys(workspaceId);
  const presenting = usePresentStore((s) => s.presenting);
  const emptyNotice = usePresentStore((s) => s.emptyNotice);
  const editorOpen = usePresentStore((s) => s.editorOpen);
  const notesOpen = usePresentStore((s) => s.notesOpen);
  const { run, at, entry } = useCurrentRun();

  // Quick, quiet fade into each scene.
  const sceneId = entry?.scene.id;
  React.useEffect(() => {
    if (!sceneId || prefersReducedMotion()) return;
    document.getElementById('canvas-root')?.animate?.(
      [{ opacity: 0.2 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' },
    );
  }, [sceneId]);

  // Keep the scene filling the screen when its group moves, resizes or goes.
  const fitKey = entry?.group ? `${entry.group.id}:${entry.group.x},${entry.group.y},${entry.group.w},${entry.group.h}` : (entry ? 'area' : 'none');
  const lastFit = React.useRef(fitKey);
  React.useEffect(() => {
    if (lastFit.current === fitKey) return;
    lastFit.current = fitKey;
    if (presenting) usePresentStore.getState().refresh();
  }, [fitKey, presenting]);

  React.useEffect(() => {
    document.documentElement.toggleAttribute('data-presenting', presenting);
    return () => document.documentElement.removeAttribute('data-presenting');
  }, [presenting]);

  return (
    <>
      {presenting && entry && <ProgressLine run={run} at={at} entry={entry} />}
      {emptyNotice && !presenting && <EmptyNotice />}
      {editorOpen && !presenting && <SceneEditor />}
      {notesOpen && <PresenterNotes run={run} at={at} entry={entry} />}
    </>
  );
}

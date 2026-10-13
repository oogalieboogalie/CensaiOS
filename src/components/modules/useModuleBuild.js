import React from 'react';
import { streamModule } from '../../lib/modules/moduleApi.js';
import { builtModulePatch } from '../../lib/modules/moduleWindowState.js';
import { getCollaborationClientId } from '../../lib/collaboration/clientIdentity.js';
import { sketchImage } from '../../lib/ink/sketchActions.js';

// Spec 9 "Make real": a build from a sketch sends the drawing as an image.
async function buildBody(win, workspaceId) {
  const body = { request: win.request, workspaceId };
  if (!win.sketch) return body;
  const image = await sketchImage(win.sketch);
  if (!image) throw new Error('The sketch for this module is gone from the board.');
  return { ...body, sketch: image.dataUrl };
}

// Builds and edits for one module window. A build typed in the Add palette is
// run by the browser tab that asked for it (`buildOwner`); everyone else on
// the board watches the window's building state. Chat builds run on the
// server and stream their progress into the window instead.

export const STALLED_BUILD_MS = 3 * 60 * 1000;

export function useModuleBuild({ win, onUpdate, workspaceId }) {
  const [preview, setPreview] = React.useState('');
  const [editing, setEditing] = React.useState(null); // { instruction } while a change is applied
  const [editError, setEditError] = React.useState(null);
  const running = React.useRef(false);
  const abortRef = React.useRef(null);
  const latest = React.useRef(win);
  latest.current = win;
  const clientId = React.useMemo(() => getCollaborationClientId(), []);

  const ownsBuild = win.status === 'building' && win.buildOwner && win.buildOwner === clientId;

  React.useEffect(() => {
    if (!ownsBuild || running.current) return undefined;
    running.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setPreview('');
    buildBody(win, workspaceId)
      .then((body) => streamModule(body, { onDelta: setPreview, signal: controller.signal }))
      .then((result) => {
        onUpdate(builtModulePatch({
          request: latest.current.request,
          manifest: result.manifest,
          source: result.source,
          note: 'First build',
          by: 'You',
          versions: [],
        }));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        onUpdate({ status: 'error', error: error.message || 'The build failed.', buildOwner: null });
      })
      .finally(() => { running.current = false; abortRef.current = null; });
    return undefined;
  }, [ownsBuild, win.request, workspaceId, onUpdate]);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const retry = React.useCallback(() => {
    onUpdate({ status: 'building', buildOwner: clientId, error: null, buildPreview: null, buildStartedAt: new Date().toISOString() });
  }, [clientId, onUpdate]);

  const edit = React.useCallback(async (instruction) => {
    const text = String(instruction || '').trim();
    const current = latest.current;
    if (!text || editing || !current.source) return false;
    setEditing({ instruction: text });
    setEditError(null);
    setPreview('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await streamModule({
        instruction: text,
        request: current.request,
        source: current.source,
        manifest: current.manifest,
        workspaceId,
      }, { onDelta: setPreview, signal: controller.signal });
      const now = latest.current;
      onUpdate(builtModulePatch({
        request: now.request,
        manifest: result.manifest,
        source: result.source,
        note: text,
        by: 'You',
        versions: now.versions,
        keepSize: { w: now.w, h: now.h },
      }));
      return true;
    } catch (error) {
      if (!controller.signal.aborted) setEditError(error.message || 'The change could not be applied.');
      return false;
    } finally {
      setEditing(null);
      abortRef.current = null;
    }
  }, [editing, onUpdate, workspaceId]);

  const cancel = React.useCallback(() => abortRef.current?.abort(), []);

  const startedAt = Date.parse(win.buildStartedAt || '') || null;
  const stalled = win.status === 'building' && !ownsBuild && startedAt && Date.now() - startedAt > STALLED_BUILD_MS;

  return {
    preview: ownsBuild || editing ? preview : (win.buildPreview || ''),
    ownsBuild,
    editing,
    editError,
    clearEditError: () => setEditError(null),
    stalled,
    retry,
    edit,
    cancel,
  };
}

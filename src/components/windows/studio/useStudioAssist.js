import React from 'react';
import { assistContext, planAssist } from '../../../lib/studio/assist.js';
import { newId } from '../../../lib/studio/project.js';
import { useWorkspaceStore } from '../../../lib/store.js';
import { logToApp } from '../../../lib/appLog/browserLog.js';

// The "ask a model" box: sends the request with a description of the song
// and the chosen track, applies what comes back to that track, and keeps
// just the parts it changed so one click puts those back (and nothing else
// a teammate did since).

export async function requestStudioAssist(payload, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl('/api/design/studio/assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `The model box failed (${res.status})`), { code: data.code || String(res.status) });
  return data;
}

export function useStudioAssist({ studio, trackId, beat }) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const [busy, setBusy] = React.useState(false);
  const [answer, setAnswer] = React.useState(null);

  const restore = React.useCallback((before) => {
    if (before.trackId === 'master') { if (before.fx) studio.edit('master', { fx: before.fx }); return; }
    const track = studio.get().tracks.find(t => t.id === before.trackId);
    if (!track) return;
    const patch = {};
    if (before.fx) patch.fx = before.fx;
    if (before.clipId) patch.clips = track.clips.filter(c => c.id !== before.clipId);
    if (before.synth) patch.synth = before.synth;
    studio.edit('track', before.trackId, patch);
  }, [studio]);

  const ask = React.useCallback(async (prompt) => {
    if (busy || !prompt.trim()) return false;
    setBusy(true); setAnswer(null);
    try {
      const data = await requestStudioAssist({ prompt: prompt.trim(), context: assistContext(studio.get(), trackId), workspaceId });
      const project = studio.get();
      const plan = planAssist(project, trackId, data, { atBeat: beat() });
      const track = project.tracks.find(t => t.id === trackId);
      const before = { trackId: track ? trackId : 'master' };
      if (plan.fx) before.fx = track ? track.fx : project.master.fx;
      if (trackId === 'master') {
        if (plan.fx) studio.edit('master', { fx: plan.fx });
      } else {
        const patch = {};
        if (plan.fx) patch.fx = plan.fx;
        if (plan.clip && track) { before.clipId = newId('clip'); patch.clips = [...track.clips, { id: before.clipId, ...plan.clip }]; }
        if (plan.preset && track) { before.synth = track.synth; patch.synth = { preset: plan.preset }; }
        if (Object.keys(patch).length) studio.edit('track', trackId, patch);
      }
      const changed = plan.fx || plan.clip || plan.preset;
      setAnswer({ say: data.say || '', done: plan.done, model: data.model || '', before: changed ? before : null });
      logToApp('info', `studio: the model box answered (${plan.done.length ? plan.done.join('; ') : 'no change'})`, { where: 'studio' });
      return true;
    } catch (err) {
      setAnswer({ error: err?.message || 'The model box failed.' });
      logToApp('warn', `studio: the model box failed (${err?.code || 'no reason given'})`, { where: 'studio' });
      return false;
    } finally { setBusy(false); }
  }, [beat, busy, studio, trackId, workspaceId]);

  const undo = React.useCallback(() => {
    if (!answer?.before) return;
    restore(answer.before);
    setAnswer({ ...answer, before: null, undone: true });
  }, [answer, restore]);

  return { busy, answer, ask, undo, dismiss: () => setAnswer(null) };
}

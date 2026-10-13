import React from 'react';
import { starterProject } from '../../../lib/studio/project.js';
import { exportWav, exportProject, importProject, startRecording } from './studioFiles.js';
import { claimKeyboard } from '../../../lib/keyboardClaim.js';

// What the Studio's buttons and keys do: transport, recording, files and
// shortcuts (Space play/stop, Enter back to start, R record, L loop, K click,
// Delete removes the selected clip).

const pickFile = accept => new Promise((resolve) => {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = accept; input.multiple = true;
  input.onchange = () => resolve([...(input.files || [])]);
  input.click();
});

export function useStudioActions({ studio, audio, selection, setSelection, setTab, setEditing }) {
  const { project, edit, replace } = studio;
  const [recording, setRecording] = React.useState(null);
  const [exporting, setExporting] = React.useState(0);
  const [notice, setNotice] = React.useState('');
  const flash = React.useCallback((text) => { setNotice(text); setTimeout(() => setNotice(''), 4000); }, []);
  const armed = project.tracks.find(t => t.kind === 'audio' && t.arm);
  // Play from the playhead; with the loop on, a playhead past the loop jumps back into it.
  const startBeat = () => {
    const beat = audio.ticker.get().beat;
    return project.loop.on && beat >= project.loop.end ? project.loop.start : beat;
  };

  const play = () => audio.transport.play(startBeat()).catch(e => flash(e.message));
  const stop = () => {
    const { playing, beat } = audio.ticker.get();
    audio.transport.stop();
    if (!playing || beat === 0) audio.transport.seek(0);
  };

  const addFiles = async (files, trackId, beat = 0) => {
    let target = trackId;
    let at = beat;
    for (const file of files.filter(f => f.type.startsWith('audio') || /\.(wav|mp3|ogg|flac|m4a|aac|webm)$/i.test(f.name))) {
      try {
        const { id, asset } = await audio.addAudio(file, file.name.replace(/\.[^.]+$/, ''));
        edit('addAsset', id, asset);
        if (!target) {
          edit('addTrack', 'audio');
          target = studio.get().tracks.at(-1)?.id;
        }
        const tracks = studio.get().tracks;
        const dest = tracks.find(t => t.id === target) || tracks.filter(t => t.kind === 'audio').at(-1);
        if (dest) edit('addClip', dest.id, { kind: 'audio', asset: id, start: at, offset: 0, dur: asset.dur, name: asset.name });
        at += asset.dur / (60 / project.bpm);
      } catch {
        flash(`Couldn't read ${file.name} as audio.`);
      }
    }
  };

  const toggleRecord = async () => {
    if (recording) {
      const { session, trackId, beat } = recording;
      setRecording(null);
      audio.transport.stop();
      const blob = await session.stop();
      await addFiles([new File([blob], `Take ${new Date().toLocaleTimeString()}.webm`, { type: blob.type })], trackId, beat);
      return;
    }
    if (!armed) { flash('Arm an audio track (R on its header) to record onto it.'); return; }
    try {
      await audio.start();
      const session = await startRecording();
      const beat = startBeat();
      setRecording({ session, trackId: armed.id, beat });
      await audio.transport.play(beat);
    } catch (e) {
      flash(e?.name === 'NotAllowedError' ? 'The browser blocked the microphone.' : `Couldn't start recording: ${e?.message || e}`);
    }
  };

  const exportMix = async () => {
    if (exporting) return;
    setExporting(0.01);
    try {
      const sec = await exportWav(project, audio.decoded(), audio.sampleRate(), p => setExporting(Math.max(0.01, p)));
      flash(`Exported ${sec.toFixed(1)} seconds as 24-bit WAV.`);
    } catch (e) { flash(`Export failed: ${e?.message || e}`); } finally { setExporting(0); }
  };

  const onKeyDown = (e) => {
    if (e.target.closest?.('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    const handled = () => { e.preventDefault(); e.stopPropagation(); };
    if (k === ' ') { handled(); if (audio.ticker.get().playing) audio.transport.stop(); else play(); } else if (k === 'enter') { handled(); stop(); audio.transport.seek(0); } else if (k === 'r') { handled(); toggleRecord(); } else if (k === 'l') { handled(); edit('set', { loop: { ...project.loop, on: !project.loop.on } }); } else if (k === 'k') { handled(); edit('set', { metronome: !project.metronome }); } else if ((k === 'delete' || k === 'backspace') && selection.clipId) {
      handled(); edit('removeClip', selection.trackId, selection.clipId); setSelection({ trackId: selection.trackId, clipId: null });
    }
  };

  // While the Studio has focus its keys (Space, R, L ...) are its own, not the canvas's.
  const release = React.useRef(null);
  const onFocus = () => { release.current = release.current || claimKeyboard('studio'); };
  const onBlur = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) { release.current?.(); release.current = null; } };
  React.useEffect(() => () => release.current?.(), []);

  return {
    play, stop, toggleRecord, recording: Boolean(recording), canRecord: Boolean(armed), exporting, exportMix, notice, addFiles,
    onKeyDown, onFocus, onBlur,
    saveProject: () => exportProject(project).catch(e => flash(e.message)),
    openProject: async () => {
      const [file] = await pickFile('.json,application/json');
      if (!file) return;
      try { audio.transport.stop(); replace(await importProject(file)); setEditing(null); setTab('mixer'); } catch (e) { flash(e.message); }
    },
    pickAudio: async () => {
      const files = await pickFile('audio/*');
      const selected = project.tracks.find(t => t.id === selection.trackId && t.kind === 'audio');
      await addFiles(files, selected?.id || null, audio.ticker.get().beat);
    },
    newSong: () => { audio.transport.stop(); replace(starterProject()); setEditing(null); },
  };
}

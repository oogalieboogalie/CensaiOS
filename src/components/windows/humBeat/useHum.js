import React from 'react';
import { cleanHeard, toMelody } from '../../../lib/hum/melody.js';
import { buildSong, normalizeSettings } from '../../../lib/hum/beat.js';
import { songToMidi } from '../../../lib/hum/midiFile.js';
import { useStudioAudio } from '../studio/useStudioAudio.js';
import { download, exportWav, fileSafe, startRecording } from '../studio/studioFiles.js';
import { useWorkspaceStore } from '../../../lib/store.js';
import { EXAMPLE_HUM } from './example.js';

// What the Hum a beat window knows and does. The notes it heard and the
// sound settings live on the window record (win.hum), so a teammate on the
// board sees and plays the same beat. The recording itself stays in the
// browser that made it.

const MAX_RECORD_MS = 60000;

export function useHum({ win, onUpdate }) {
  const saved = win?.hum || {};
  const heard = React.useMemo(() => cleanHeard(saved.heard), [saved.heard]);
  const settings = React.useMemo(() => normalizeSettings(saved.settings), [saved.settings]);
  const title = win?.title && win.title !== 'Hum a beat' ? win.title : 'Hummed beat';
  const melody = React.useMemo(() => toMelody(heard), [heard]);
  const song = React.useMemo(() => buildSong(melody, settings, title), [melody, settings, title]);
  const audio = useStudioAudio(song);

  const [phase, setPhase] = React.useState('idle'); // idle | recording | listening
  const [progress, setProgress] = React.useState(0);
  const [elapsed, setElapsed] = React.useState(0);
  const [notice, setNotice] = React.useState('');
  const [take, setTake] = React.useState(null); // object URL of this browser's last recording
  const rec = React.useRef(null);
  const save = React.useRef(onUpdate);
  save.current = onUpdate;

  const patch = React.useCallback((next) => save.current?.({ hum: { ...(win?.hum || {}), ...next } }), [win?.hum]);
  const set = React.useCallback((s) => patch({ settings: normalizeSettings({ ...settings, ...s }) }), [patch, settings]);

  const listen = React.useCallback(async (blob, label) => {
    audio.transport.stop();
    setPhase('listening'); setProgress(0); setNotice('');
    try {
      const { transcribe } = await import('../../../lib/hum/transcribe.js');
      const out = await transcribe(blob, { onProgress: setProgress });
      const found = toMelody(out.notes).length;
      patch({ heard: out.notes, source: label, seconds: Math.round(out.seconds * 10) / 10 });
      setNotice(found
        ? `Found ${found} ${found === 1 ? 'note' : 'notes'} in ${out.seconds.toFixed(1)} seconds of sound.${out.trimmed ? ' Only the first minute was used.' : ''}`
        : 'No clear notes in that one. Hum a little louder, one note at a time, close to the microphone.');
    } catch (e) {
      setNotice(`Could not find the notes: ${e?.message || e}`);
    } finally { setPhase('idle'); }
  }, [audio.transport, patch]);

  const stopRecording = React.useCallback(async () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    clearInterval(r.timer); clearTimeout(r.limit);
    const blob = await r.session.stop();
    setTake(old => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
    await listen(blob, 'Your recording');
  }, [listen]);

  const startRecordingHum = React.useCallback(async () => {
    if (rec.current || phase !== 'idle') return;
    setNotice('');
    try {
      audio.transport.stop();
      const session = await startRecording();
      const began = Date.now();
      setElapsed(0); setPhase('recording');
      rec.current = {
        session,
        timer: setInterval(() => setElapsed((Date.now() - began) / 1000), 200),
        limit: setTimeout(() => stopRecording(), MAX_RECORD_MS),
      };
    } catch (e) {
      setPhase('idle');
      setNotice(e?.name === 'NotAllowedError'
        ? 'The microphone is blocked for censaiOS. Allow it in the browser bar, or open a sound file instead.'
        : `The microphone did not start: ${e?.message || e}`);
    }
  }, [audio.transport, phase, stopRecording]);

  React.useEffect(() => () => {
    const r = rec.current;
    if (r) { clearInterval(r.timer); clearTimeout(r.limit); r.session.stop().catch(() => {}); }
  }, []);
  React.useEffect(() => () => { if (take) URL.revokeObjectURL(take); }, [take]);

  const openFile = React.useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'audio/*,.wav,.mp3,.m4a,.ogg,.webm,.flac';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      setTake(old => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(file); });
      listen(file, file.name);
    };
    input.click();
  }, [listen]);

  const [exporting, setExporting] = React.useState(0);
  const exportMix = React.useCallback(async () => {
    if (exporting) return;
    setExporting(0.01);
    try {
      const sec = await exportWav(song, new Map(), audio.sampleRate(), p => setExporting(Math.max(0.01, p)));
      setNotice(`Saved ${sec.toFixed(1)} seconds as a WAV file.`);
    } catch (e) { setNotice(`The WAV did not save: ${e?.message || e}`); } finally { setExporting(0); }
  }, [audio, exporting, song]);

  const spawnAt = useWorkspaceStore(state => state.spawnAt);
  const actions = {
    startRecording: startRecordingHum, stopRecording, openFile,
    tryExample: () => { patch({ heard: EXAMPLE_HUM, source: 'Example hum', seconds: 10.7 }); setNotice('Loaded an example hum. Press play to hear it as a beat.'); },
    clear: () => { audio.transport.stop(); patch({ heard: [], source: '', seconds: 0 }); setNotice(''); },
    play: () => audio.transport.play(0).catch(e => setNotice(`Sound did not start: ${e?.message || e}`)),
    stop: () => audio.transport.stop(),
    exportMidi: () => {
      download(new Blob([songToMidi(song)], { type: 'audio/midi' }), `${fileSafe(song.title)}.mid`);
      setNotice('Saved a MIDI file. Open it in any music program to keep working on the notes.');
    },
    exportMix,
    openInStudio: () => {
      audio.transport.stop();
      const beside = Number.isFinite(win?.x) ? { x: win.x + (win.w || win.width || 900) + 24, y: win.y || 0 } : null;
      spawnAt?.('studio', { title: song.title, studio: song }, beside);
      setNotice('Opened a copy in Studio. Changes there do not come back here.');
    },
  };

  return { heard, melody, settings, song, audio, phase, progress, elapsed, notice, take, exporting, source: saved.source || '', set, actions };
}

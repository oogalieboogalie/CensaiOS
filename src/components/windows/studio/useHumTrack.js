import React from 'react';
import { toMelody, onTheBeat, barsFor } from '../../../lib/hum/melody.js';
import { fitToScale } from '../../../lib/studio/musicKey.js';
import { snapBeats, MAX_TRACKS } from '../../../lib/studio/project.js';
import { startRecording } from './studioFiles.js';
import { logToApp } from '../../../lib/appLog/browserLog.js';

// Hum straight into the Studio: the microphone records, the note finder from
// the Hum a beat window (Basic Pitch, runs in this browser) writes down the
// notes, and they land on a new synth track at the playhead, on the grid
// and, with the key lock on, in the song's key. The recording never leaves
// this computer.

const MAX_MS = 30000;

/** A hummed take as a synth track: notes on the beat grid from the playhead, whole bars long. */
export function humToTrack(heard, project, atBeat = 0) {
  // Humming is loose: an eighth-note grid at the finest keeps it from turning into stutters.
  const grid = Math.max(0.5, snapBeats(project.snap) || 0.5);
  let notes = onTheBeat(toMelody(heard), { bpm: project.bpm, grid });
  if (!notes.length) return null;
  if (project.scaleLock) notes = fitToScale(notes, project.key, project.scale);
  const len = barsFor(notes, project.beatsPerBar) * project.beatsPerBar;
  return {
    name: 'Hummed melody',
    synth: { preset: 'lead' },
    clips: [{ kind: 'midi', start: atBeat, len, notes: notes.filter(n => n.t < len), name: 'Hum' }],
  };
}

export function useHumTrack({ studio, audio, beat, flash, onDone }) {
  const [phase, setPhase] = React.useState('idle'); // idle | recording | listening
  const [elapsed, setElapsed] = React.useState(0);
  const [progress, setProgress] = React.useState(0);
  const rec = React.useRef(null);
  const starting = React.useRef(false);
  const gone = React.useRef(false);

  const finish = React.useCallback(async () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    clearInterval(r.timer); clearTimeout(r.limit);
    const blob = await r.session.stop();
    setPhase('listening'); setProgress(0);
    try {
      const { transcribe } = await import('../../../lib/hum/transcribe.js');
      const out = await transcribe(blob, { onProgress: setProgress });
      const track = humToTrack(out.notes, studio.get(), r.beat);
      if (!track) { flash('No clear notes in that one. Hum a little louder, one note at a time.'); return; }
      const count = studio.get().tracks.length;
      studio.edit('addTrack', 'synth', track);
      if (studio.get().tracks.length === count) { flash(`A song holds ${MAX_TRACKS} tracks. Remove one, then hum again.`); return; }
      onDone?.(studio.get().tracks.at(-1));
      flash(`Heard ${track.clips[0].notes.length} notes. They are on the new "Hummed melody" track.`);
      logToApp('info', `studio: a hum became a synth track (${track.clips[0].notes.length} notes)`, { where: 'studio' });
    } catch (err) {
      flash('The note finder did not finish. Try again, or use the Hum a beat window.');
      logToApp('warn', `studio: hum to notes failed (${err?.name || 'no reason given'})`, { where: 'studio' });
    } finally { setPhase('idle'); }
  }, [flash, onDone, studio]);

  const start = React.useCallback(async () => {
    if (rec.current || starting.current || phase !== 'idle') return;
    starting.current = true;
    try {
      audio.transport.stop();
      const session = await startRecording();
      // Closed while the browser asked about the microphone: let the mic go at once.
      if (gone.current) { session.stop().catch(() => {}); return; }
      const began = Date.now();
      setElapsed(0); setPhase('recording');
      rec.current = {
        session, beat: beat(),
        timer: setInterval(() => setElapsed((Date.now() - began) / 1000), 200),
        limit: setTimeout(() => finish(), MAX_MS),
      };
    } catch (err) {
      setPhase('idle');
      flash(err?.name === 'NotAllowedError' ? 'The browser blocked the microphone. Allow it in the address bar.' : 'The microphone did not start.');
    } finally { starting.current = false; }
  }, [audio.transport, beat, finish, flash, phase]);

  React.useEffect(() => () => {
    gone.current = true;
    const r = rec.current;
    if (r) { clearInterval(r.timer); clearTimeout(r.limit); r.session.stop().catch(() => {}); }
  }, []);

  return { phase, elapsed, progress, start, stop: finish };
}

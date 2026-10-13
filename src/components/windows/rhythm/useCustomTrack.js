import React from 'react';
import { probeDuration, readTrack } from '../../../lib/games/rhythm/track.js';

/**
 * "Your own track": decode an audio file the player picks and chart it for
 * every difficulty. The file stays in this browser; only scores are shared.
 */
export function useCustomTrack({ getAudio, difficulty, onReady }) {
  const [custom, setCustom] = React.useState(null);
  const [customNote, setCustomNote] = React.useState(null);
  const readyRef = React.useRef(onReady);
  readyRef.current = onReady;

  const loadFile = React.useCallback(async (file) => {
    if (!file) return;
    setCustomNote('Listening for the beat…');
    const got = await readTrack(file, { probe: probeDuration, decode: (bytes) => getAudio().ctx.decodeAudioData(bytes) });
    if (!got.ok) { setCustomNote(got.note); return; }
    setCustom({ name: got.name, buffer: got.buffer, charts: got.charts });
    readyRef.current?.();
    setCustomNote(`${got.charts[difficulty].length} notes charted from ${got.name}.`);
  }, [getAudio, difficulty]);

  return { custom, customNote, loadFile };
}

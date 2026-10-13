import React from 'react';

// Plays a local audio file through the Web Audio API so the visualizer reads
// the real signal. The graph is
//
//   <audio> -> source -> analyser (spectrum + waveform)
//                     -> splitter -> left / right analysers (VU meters)
//                     -> gain (this viewer's volume) -> speakers
//
// The analysers tap the signal before the volume, so the meters still dance
// when this person has turned their own sound down. Browsers only allow an
// AudioContext after a click, so the graph is built on the first play.

function buildGraph(audio) {
  const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!Ctx) return null;
  try {
    const ctx = new Ctx();
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.6;
    const splitter = ctx.createChannelSplitter(2);
    const left = ctx.createAnalyser();
    const right = ctx.createAnalyser();
    left.fftSize = 1024;
    right.fftSize = 1024;
    const gain = ctx.createGain();
    source.connect(analyser);
    source.connect(splitter);
    splitter.connect(left, 0);
    splitter.connect(right, 1);
    source.connect(gain);
    gain.connect(ctx.destination);
    return { ctx, gain, signal: { analyser, left, right } };
  } catch {
    return null;
  }
}

export function useLocalAudio({ track, volume, muted, onEnded }) {
  const audioRef = React.useRef(null);
  const graphRef = React.useRef(null);
  const endedRef = React.useRef(onEnded);
  endedRef.current = onEnded;
  const [state, setState] = React.useState({ playing: false, position: 0, duration: 0 });
  const [signal, setSignal] = React.useState(null);

  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio();
    audioRef.current.preload = 'metadata';
  }

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const sync = () => setState({
      playing: !audio.paused && !audio.ended,
      position: audio.currentTime || 0,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
    });
    const ended = () => { sync(); endedRef.current?.(); };
    const events = ['play', 'pause', 'timeupdate', 'loadedmetadata', 'durationchange', 'seeked'];
    events.forEach(ev => audio.addEventListener(ev, sync));
    audio.addEventListener('ended', ended);
    return () => {
      events.forEach(ev => audio.removeEventListener(ev, sync));
      audio.removeEventListener('ended', ended);
    };
  }, []);

  React.useEffect(() => () => {
    if (audioRef.current?.getAttribute('src')) audioRef.current.pause();
    graphRef.current?.ctx.close?.().catch?.(() => {});
  }, []);

  const url = track?.url || '';
  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!url) {
      if (!audio.getAttribute('src')) return;
      audio.pause();
      audio.removeAttribute('src');
      setState({ playing: false, position: 0, duration: 0 });
      return;
    }
    audio.src = url;
    audio.currentTime = 0;
    setState({ playing: false, position: 0, duration: 0 });
  }, [url]);

  const level = muted ? 0 : volume / 100;
  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (graphRef.current) {
      graphRef.current.gain.gain.value = level;
      audio.volume = 1;
    } else {
      audio.volume = level;
    }
  }, [level]);

  const play = React.useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.getAttribute('src')) return;
    if (!graphRef.current) {
      graphRef.current = buildGraph(audio);
      if (graphRef.current) {
        graphRef.current.gain.gain.value = level;
        audio.volume = 1;
        setSignal(graphRef.current.signal);
      }
    }
    graphRef.current?.ctx.resume?.().catch?.(() => {});
    const started = audio.play();
    if (started && typeof started.catch === 'function') started.catch(() => {});
  }, [level]);

  const pause = React.useCallback(() => {
    if (audioRef.current?.getAttribute('src')) audioRef.current.pause();
  }, []);

  const toggle = React.useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) play(); else pause();
  }, [play, pause]);

  const seekTo = React.useCallback((seconds) => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    const max = Number.isFinite(audio.duration) ? audio.duration : seconds;
    audio.currentTime = Math.max(0, Math.min(max, seconds));
  }, []);

  return { ...state, signal, play, pause, toggle, seekTo };
}

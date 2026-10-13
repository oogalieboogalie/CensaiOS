// Playback and export for Censai Video. One hidden <video> or <audio> per
// source file; each frame the active clips are drawn into the preview
// canvas. Export plays the edit through once while MediaRecorder captures
// the canvas and the mixed sound, so it takes as long as the video.
import React from 'react';
import { mediaUrl } from '../../../lib/creative/mediaStore.js';
import { activeClip, duration } from '../../../lib/creative/videoModel.js';
import { drawFrame } from '../../../lib/creative/videoDraw.js';
import { patchWebmDuration } from '../../../lib/creative/webmDuration.js';

export const RECORD_TYPES = Object.freeze([
  { ext: 'mp4', label: 'MP4', mimes: ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/mp4'] },
  { ext: 'webm', label: 'WebM', mimes: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'] },
]);

/** The first recording type this browser supports for a format, or null. */
export function recordMime(ext) {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return null;
  return RECORD_TYPES.find((t) => t.ext === ext)?.mimes.find((m) => MediaRecorder.isTypeSupported(m)) || null;
}

export function useVideoEngine(doc, canvasRef) {
  const docRef = React.useRef(doc);
  docRef.current = doc;
  const els = React.useRef(new Map()); // media id → element
  const images = React.useRef(new Map()); // picture src → Image
  const audio = React.useRef(null); // { ctx, monitor, rec }
  const clock = React.useRef({ t: 0, playing: false, raf: 0, base: 0, at: 0, onEnd: null });
  const [time, setTime] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [missing, setMissing] = React.useState([]);

  // Make an element for every stored file the edit uses.
  React.useEffect(() => {
    let alive = true;
    const need = new Map();
    for (const id of doc.ids) {
      const m = doc.clips[id].media;
      if (m?.id && (m.kind === 'video' || m.kind === 'audio')) need.set(m.id, m.kind);
    }
    if (!need.size) return undefined;
    Promise.all([...need].map(async ([id, kind]) => {
      if (els.current.has(id)) return null;
      const url = await mediaUrl(id);
      if (!url) return id;
      const el = document.createElement(kind);
      el.preload = 'auto';
      el.src = url;
      el.playsInline = true;
      el.addEventListener('seeked', () => draw());
      el.addEventListener('loadeddata', () => draw());
      els.current.set(id, el);
      if (audio.current) connect(el);
      return null;
    })).then((gone) => {
      const next = gone.filter(Boolean);
      if (alive) setMissing((cur) => (cur.join() === next.join() ? cur : next));
    });
    return () => { alive = false; };
  }, [doc]);

  const imageFor = (src) => {
    if (!images.current.has(src)) {
      const img = new Image();
      img.onload = () => draw();
      img.src = src;
      images.current.set(src, img);
    }
    return images.current.get(src);
  };

  function draw(t = clock.current.t) {
    const c = canvasRef.current;
    if (!c) return;
    drawFrame(c.getContext('2d'), docRef.current, t, { element: (id) => els.current.get(id), image: imageFor });
  }

  function connect(el) {
    const a = audio.current;
    if (!a || el.dataset.wired) return;
    const src = a.ctx.createMediaElementSource(el);
    src.connect(a.monitor);
    src.connect(a.rec);
    el.dataset.wired = '1';
  }
  const ensureAudio = () => {
    if (audio.current || typeof window.AudioContext !== 'function') return audio.current;
    const ctx = new window.AudioContext();
    const monitor = ctx.createGain();
    monitor.connect(ctx.destination);
    audio.current = { ctx, monitor, rec: ctx.createMediaStreamDestination() };
    for (const el of els.current.values()) connect(el);
    return audio.current;
  };

  /** Keep each track's element playing the right spot of the right clip. */
  const syncMedia = (t, play) => {
    const d = docRef.current;
    const live = new Set();
    for (const track of ['v', 'a']) {
      const id = activeClip(d, track, t);
      const c = id && d.clips[id];
      const el = c?.media?.id && els.current.get(c.media.id);
      if (!el) continue;
      live.add(el);
      const want = (c.in || 0) + (t - c.start);
      el.volume = Math.max(0, Math.min(1, c.volume ?? 1));
      if (!play) { if (Math.abs(el.currentTime - want) > 0.01) el.currentTime = want; continue; }
      if (el.paused) { el.currentTime = want; el.play().catch(() => {}); } else if (Math.abs(el.currentTime - want) > 0.25) el.currentTime = want;
    }
    for (const el of els.current.values()) if (!live.has(el) && !el.paused) el.pause();
  };

  const tick = () => {
    const k = clock.current;
    if (!k.playing) return;
    const end = duration(docRef.current);
    k.t = Math.min(end, k.base + (performance.now() - k.at) / 1000);
    syncMedia(k.t, true);
    draw(k.t);
    setTime(k.t);
    if (k.t >= end) { stop(); k.onEnd?.(); k.onEnd = null; return; }
    k.raf = requestAnimationFrame(tick);
  };

  const play = () => {
    const k = clock.current;
    if (k.playing) return;
    const a = ensureAudio();
    a?.ctx.resume?.();
    if (k.t >= duration(docRef.current) - 0.05) k.t = 0;
    k.playing = true;
    k.base = k.t;
    k.at = performance.now();
    setPlaying(true);
    k.raf = requestAnimationFrame(tick);
  };
  function stop() {
    const k = clock.current;
    k.playing = false;
    cancelAnimationFrame(k.raf);
    for (const el of els.current.values()) el.pause();
    setPlaying(false);
  }
  const seek = (t) => {
    const k = clock.current;
    const was = k.playing;
    if (was) stop();
    k.t = Math.max(0, Math.min(t, Math.max(duration(docRef.current), 0)));
    setTime(k.t);
    syncMedia(k.t, false);
    draw(k.t);
    if (was) play();
  };

  /** Record the whole edit to a file Blob. `onProgress(0..1)`. */
  const record = (ext, onProgress) => new Promise((resolve, reject) => {
    const mime = recordMime(ext);
    const c = canvasRef.current;
    if (!mime || !c?.captureStream) { reject(new Error(`This browser cannot record ${ext.toUpperCase()} video.`)); return; }
    const total = duration(docRef.current);
    if (total <= 0) { reject(new Error('Add a clip first.')); return; }
    stop();
    const a = ensureAudio();
    const tracks = [...c.captureStream(docRef.current.fps).getVideoTracks(), ...(a ? a.rec.stream.getAudioTracks() : [])];
    const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    rec.onstop = async () => {
      if (a) a.monitor.gain.value = 1;
      const type = mime.split(';')[0];
      const blob = new Blob(chunks, { type });
      if (ext !== 'webm') { resolve(blob); return; }
      const fixed = patchWebmDuration(new Uint8Array(await blob.arrayBuffer()), total * 1000);
      resolve(new Blob([fixed], { type }));
    };
    rec.onerror = (e) => reject(e.error || new Error('Recording failed.'));
    if (a) a.monitor.gain.value = 0;
    const k = clock.current;
    k.t = 0;
    syncMedia(0, false);
    draw(0);
    const progress = setInterval(() => onProgress?.(Math.min(1, k.t / total)), 250);
    k.onEnd = () => { clearInterval(progress); setTimeout(() => rec.stop(), 150); };
    rec.start(500);
    setTimeout(play, 120);
  });

  React.useEffect(() => { draw(); }, [doc]);
  React.useEffect(() => () => { stop(); audio.current?.ctx.close?.(); }, []);

  return { time, playing, missing, play, stop, seek, record, toggle: () => (clock.current.playing ? stop() : play()) };
}

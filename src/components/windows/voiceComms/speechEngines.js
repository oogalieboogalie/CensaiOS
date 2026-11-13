// Browser-side audio for the Comms window: the mic (with a live level), the
// browser's speech recognition, and playback of a reply.

import { pickVoice, recognitionErrorMessage, stripForSpeech } from './voiceLogic.js';

const RECOGNITION_SETTLE_MS = 2500;

function recognitionClass() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function browserRecognitionSupported() {
  return Boolean(recognitionClass());
}

export function micSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

/** System voices load lazily; asking once early means they are ready to speak. */
export function primeVoices() {
  try { window.speechSynthesis?.getVoices(); } catch { /* no speech synthesis */ }
}

/**
 * Open the mic. `level()` is the current loudness 0..1 for the meter;
 * `stop()` releases the mic and resolves to the recording (when `record`).
 */
export async function openMic({ record = false } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = AudioCtx ? new AudioCtx() : null;
  let analyser = null;
  let samples = null;
  if (ctx) {
    ctx.resume?.().catch(() => {});
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    samples = new Uint8Array(analyser.fftSize);
  }
  const chunks = [];
  let recorder = null;
  if (record) {
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    recorder.start();
  }
  const release = () => {
    stream.getTracks().forEach((track) => track.stop());
    ctx?.close?.().catch(() => {});
  };
  return {
    level() {
      if (!analyser) return 0;
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i += 1) {
        const v = (samples[i] - 128) / 128;
        sum += v * v;
      }
      return Math.min(1, Math.sqrt(sum / samples.length) * 4);
    },
    stop() {
      return new Promise((resolve) => {
        if (!recorder || recorder.state === 'inactive') { release(); resolve(null); return; }
        recorder.onstop = () => {
          release();
          resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }) : null);
        };
        recorder.stop();
      });
    },
  };
}

/** Live speech recognition. `stop()` resolves to everything that was heard. */
export function startRecognition({ onInterim } = {}) {
  const Recognition = recognitionClass();
  const rec = new Recognition();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = navigator.language || 'en-US';
  let finalText = '';
  let interim = '';
  let failure = null;
  let settle;
  const ended = new Promise((resolve) => { settle = resolve; });
  rec.onresult = (event) => {
    interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result.isFinal) finalText += `${result[0].transcript} `;
      else interim += result[0].transcript;
    }
    onInterim?.(`${finalText}${interim}`.trim());
  };
  rec.onerror = (event) => {
    if (event.error !== 'no-speech' && event.error !== 'aborted') failure = event.error;
  };
  rec.onend = () => settle();
  rec.start();
  return {
    async stop() {
      try { rec.stop(); } catch { settle(); }
      await Promise.race([ended, new Promise((resolve) => setTimeout(resolve, RECOGNITION_SETTLE_MS))]);
      if (failure) throw new Error(recognitionErrorMessage(failure));
      return `${finalText}${interim}`.trim();
    },
    cancel() {
      try { rec.abort(); } catch { /* already stopped */ }
    },
  };
}

/** Play a reply clip. Returns a function that stops it. */
export function playAudioUrl(url, onEnd) {
  const audio = new Audio(url);
  let finished = false;
  const finish = () => { if (!finished) { finished = true; onEnd?.(); } };
  audio.onended = finish;
  audio.onerror = finish;
  audio.play().catch(finish);
  return () => { audio.pause(); finish(); };
}

/** Read a reply with a system voice. Returns a function that stops it. */
export function speakWithBrowser(text, { seed = 0, onEnd } = {}) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  const spoken = stripForSpeech(text);
  if (!synth || !spoken) { onEnd?.(); return () => {}; }
  let finished = false;
  const finish = () => { if (!finished) { finished = true; onEnd?.(); } };
  const utterance = new SpeechSynthesisUtterance(spoken);
  const voice = pickVoice(synth.getVoices(), seed, navigator.language);
  if (voice) utterance.voice = voice;
  utterance.rate = 1.04;
  utterance.onend = finish;
  utterance.onerror = finish;
  synth.cancel();
  synth.speak(utterance);
  return () => { synth.cancel(); finish(); };
}

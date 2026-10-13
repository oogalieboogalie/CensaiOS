import React from 'react';
import { recordingToWavDataUrl } from '../../lib/chat/attachments.js';
import { synthesizeSpeech } from '../../lib/chat.js';

const MAX_RECORDING_MS = 4 * 60 * 1000;

export function micSupported() {
  return typeof window !== 'undefined'
    && typeof window.MediaRecorder !== 'undefined'
    && Boolean(navigator?.mediaDevices?.getUserMedia);
}

/** Record from the mic; `onClip(wavDataUrl)` fires when recording stops. */
export function useVoiceRecorder({ onClip, onError }) {
  const [recording, setRecording] = React.useState(false);
  const [processing, setProcessing] = React.useState(false);
  const recorderRef = React.useRef(null);
  const timerRef = React.useRef(null);

  const stop = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

  const start = React.useCallback(async () => {
    if (recorderRef.current?.state === 'recording') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        recorderRef.current = null;
        setRecording(false);
        if (!chunks.length) return;
        setProcessing(true);
        try {
          const wav = await recordingToWavDataUrl(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
          await onClip?.(wav);
        } catch (err) {
          onError?.(err?.message || 'Could not process the recording.');
        } finally {
          setProcessing(false);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      timerRef.current = setTimeout(stop, MAX_RECORDING_MS);
    } catch (err) {
      onError?.(err?.name === 'NotAllowedError' ? 'Microphone access was blocked.' : 'Could not start the microphone.');
    }
  }, [onClip, onError, stop]);

  React.useEffect(() => () => stop(), [stop]);

  return { recording, processing, start, stop, toggle: recording ? stop : start };
}

/** Read agent replies aloud through the provider's text-to-speech. */
export function useSpeaker(agentId, { workspaceId } = {}) {
  const [playingKey, setPlayingKey] = React.useState(null);
  const [loadingKey, setLoadingKey] = React.useState(null);
  const [error, setError] = React.useState(null);
  const audioRef = React.useRef(null);
  const cacheRef = React.useRef(new Map());

  const stop = React.useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingKey(null);
  }, []);

  const speak = React.useCallback(async (key, text) => {
    if (playingKey === key) { stop(); return; }
    stop();
    setError(null);
    try {
      let url = cacheRef.current.get(key);
      if (!url) {
        setLoadingKey(key);
        url = await synthesizeSpeech(agentId, text, { workspaceId });
        if (url) cacheRef.current.set(key, url);
      }
      setLoadingKey(null);
      if (!url) return;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { if (audioRef.current === audio) { audioRef.current = null; setPlayingKey(null); } };
      setPlayingKey(key);
      await audio.play();
    } catch (err) {
      setLoadingKey(null);
      setPlayingKey(null);
      setError(err?.message || 'Could not read that aloud.');
    }
  }, [agentId, workspaceId, playingKey, stop]);

  React.useEffect(() => () => audioRef.current?.pause(), []);

  return { speak, stop, playingKey, loadingKey, error, clearError: () => setError(null) };
}

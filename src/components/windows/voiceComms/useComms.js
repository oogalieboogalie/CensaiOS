import React from 'react';
import { fetchChatCapabilities, sendMessageWithMeta, synthesizeSpeech, transcribeSpeech } from '../../../lib/chat.js';
import { messagesForSend, recordingToWavDataUrl } from '../../../lib/chat/attachments.js';
import { browserRecognitionSupported, openMic, playAudioUrl, primeVoices, speakWithBrowser, startRecognition } from './speechEngines.js';
import { MIN_HOLD_MS, NO_INPUT_MESSAGE, VOICE_NOTE, appendExchange, micErrorMessage, pickInputMode } from './voiceLogic.js';

const NOTHING_HEARD = "Didn't catch that. Keep holding while you speak.";

function dataUrlBytes(dataUrl) {
  return Math.floor(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);
}

/**
 * Push-to-talk with one agent at a time.
 * phase: idle → listening → transcribing → thinking → speaking → idle
 * `start(agentId)` on press, `stop()` on release, `interrupt()` to cut it off.
 */
export function useComms({ win, onUpdate, workspaceId, agents }) {
  const [phase, setPhase] = React.useState('idle');
  const [heard, setHeard] = React.useState('');
  const [reply, setReply] = React.useState('');
  const [error, setError] = React.useState(null);
  const meterRef = React.useRef(null);
  const latest = React.useRef({});
  latest.current = { win, onUpdate, workspaceId, agents };
  const run = React.useRef(0); // bumping this cancels whatever is in flight
  const session = React.useRef(null);
  const abort = React.useRef(null);
  const stopSpeech = React.useRef(null);
  const frame = React.useRef(0);
  const capsCache = React.useRef(new Map());

  const capsFor = React.useCallback(async (agentId) => {
    if (capsCache.current.has(agentId)) return capsCache.current.get(agentId);
    try {
      const data = await fetchChatCapabilities(agentId, { workspaceId: latest.current.workspaceId });
      capsCache.current.set(agentId, data?.capabilities || null);
      return data?.capabilities || null;
    } catch {
      return null; // not cached: the server may just be starting
    }
  }, []);

  const setLevel = (value) => meterRef.current?.style.setProperty('--vc-level', String(value));
  const stopMeter = React.useCallback(() => {
    cancelAnimationFrame(frame.current);
    setLevel(0);
  }, []);
  const startMeter = React.useCallback((mic) => {
    const tick = () => {
      setLevel(mic.level().toFixed(3));
      frame.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const interrupt = React.useCallback(() => {
    run.current += 1;
    abort.current?.abort();
    abort.current = null;
    stopSpeech.current?.();
    stopSpeech.current = null;
    setPhase('idle');
  }, []);

  const speak = React.useCallback(async (agentId, text, token) => {
    const done = () => { if (token === run.current) setPhase('idle'); };
    if (latest.current.win?.muted || !text) { done(); return; }
    const caps = await capsFor(agentId);
    if (token !== run.current) return;
    if (caps?.voiceOutput) {
      try {
        const url = await synthesizeSpeech(agentId, text, { workspaceId: latest.current.workspaceId });
        if (token !== run.current) return;
        if (url) { setPhase('speaking'); stopSpeech.current = playAudioUrl(url, done); return; }
      } catch { /* fall back to a system voice */ }
      if (token !== run.current) return;
    }
    setPhase('speaking');
    const seed = Math.max(0, (latest.current.agents || []).findIndex((a) => a.id === agentId));
    stopSpeech.current = speakWithBrowser(text, { seed, onEnd: done });
  }, [capsFor]);

  const converse = React.useCallback(async (agentId, text, attachment, token) => {
    setPhase('thinking');
    const { win: w, workspaceId: ws, onUpdate: update } = latest.current;
    const thread = w?.threads?.[agentId] || [];
    const spoken = { from: 'me', text: `${VOICE_NOTE}\n\n${text}`.trim(), ...(attachment ? { attachments: [attachment] } : {}) };
    const controller = new AbortController();
    abort.current = controller;
    let streamed = '';
    let round = 0;
    const result = await sendMessageWithMeta(agentId, messagesForSend([...thread, spoken]), {
      windowId: w?.id,
      workspaceId: ws,
      signal: controller.signal,
      onDelta: (chunk, r) => {
        if (r !== round) { round = r; streamed = ''; }
        streamed += chunk;
        if (token === run.current) setReply(streamed);
      },
    });
    if (token !== run.current) return;
    const answer = result.text || '';
    setReply(answer);
    update?.({ threads: { ...(latest.current.win?.threads || {}), [agentId]: appendExchange(thread, agentId, text, answer) } });
    await speak(agentId, answer, token);
  }, [speak]);

  const finish = React.useCallback(async (s) => {
    session.current = null;
    stopMeter();
    if (s.releasedAt - s.startedAt < MIN_HOLD_MS) { // a tap only selects the agent
      s.rec?.cancel();
      await s.mic?.stop();
      if (s.token === run.current) setPhase('idle');
      return;
    }
    setPhase('transcribing');
    try {
      let text = '';
      let attachment = null;
      if (s.mode === 'browser') {
        [text] = await Promise.all([s.rec.stop(), s.mic?.stop()]);
      } else {
        const blob = await s.mic.stop();
        if (!blob) throw new Error(NOTHING_HEARD);
        const wav = await recordingToWavDataUrl(blob);
        if (s.mode === 'provider') text = await transcribeSpeech(s.agentId, wav, { workspaceId: latest.current.workspaceId });
        else attachment = { kind: 'audio', name: 'voice message.wav', mime: 'audio/wav', size: dataUrlBytes(wav), dataUrl: wav };
      }
      if (s.token !== run.current) return;
      if (!text && !attachment) throw new Error(NOTHING_HEARD);
      setHeard(text || 'Voice message');
      await converse(s.agentId, text, attachment, s.token);
    } catch (err) {
      if (s.token !== run.current || err?.code === 'CHAT_ABORTED') return;
      setError(err?.message || 'Something went wrong. Try again.');
      setPhase('idle');
    }
  }, [converse, stopMeter]);

  const start = React.useCallback(async (agentId) => {
    if (session.current || !agentId) return;
    interrupt();
    const s = { agentId, token: run.current, startedAt: Date.now(), releasedAt: 0, ready: false, mode: null, mic: null, rec: null };
    session.current = s;
    setError(null);
    setHeard('');
    setReply('');
    setPhase('listening');
    const fail = (message) => {
      if (session.current === s) session.current = null;
      if (s.token === run.current) { setError(message); setPhase('idle'); }
    };
    s.mode = pickInputMode(await capsFor(agentId), browserRecognitionSupported());
    if (!s.mode) { fail(NO_INPUT_MESSAGE); return; }
    try {
      s.mic = await openMic({ record: s.mode !== 'browser' });
    } catch (err) {
      fail(micErrorMessage(err));
      return;
    }
    try {
      if (s.mode === 'browser') s.rec = startRecognition({ onInterim: (t) => { if (s.token === run.current) setHeard(t); } });
    } catch {
      await s.mic.stop();
      fail('Speech recognition could not start. Try again.');
      return;
    }
    if (s.token !== run.current) { s.rec?.cancel(); await s.mic.stop(); return; }
    s.ready = true;
    startMeter(s.mic);
    if (s.releasedAt) finish(s);
  }, [capsFor, finish, interrupt, startMeter]);

  const stop = React.useCallback(() => {
    const s = session.current;
    if (!s || s.releasedAt) return;
    s.releasedAt = Date.now();
    if (s.ready) finish(s);
  }, [finish]);

  React.useEffect(() => {
    primeVoices();
    return () => {
      run.current += 1;
      abort.current?.abort();
      stopSpeech.current?.();
      cancelAnimationFrame(frame.current);
      const s = session.current;
      session.current = null;
      s?.rec?.cancel();
      s?.mic?.stop();
    };
  }, []);

  return { phase, heard, reply, error, start, stop, interrupt, meterRef, prefetch: capsFor };
}

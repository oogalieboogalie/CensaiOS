import React from 'react';
import { saveAsset, loadAsset, computePeaks } from '../../../lib/studio/assetStore.js';
import { newId } from '../../../lib/studio/project.js';
import { createTicker } from './ticker.js';

// Connects a Studio window to the audio thread. The AudioContext and the
// worklet start on the first play (browsers need a click for sound); audio
// files are decoded at the context's rate and handed to the worklet once.

function channelsOf(buffer) {
  return Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, c) => buffer.getChannelData(c).slice());
}

export function useStudioAudio(project) {
  const ticker = React.useMemo(createTicker, []);
  const ref = React.useRef({ ctx: null, node: null, starting: null, decoded: new Map(), sent: new Set() });
  const [missing, setMissing] = React.useState([]);
  const [error, setError] = React.useState('');
  const projectRef = React.useRef(project);
  projectRef.current = project;

  const context = React.useCallback(() => {
    const r = ref.current;
    if (!r.ctx) {
      const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!Ctx) throw new Error('This browser has no Web Audio.');
      r.ctx = new Ctx({ latencyHint: 'interactive' });
    }
    return r.ctx;
  }, []);

  const post = React.useCallback((msg) => ref.current.node?.port.postMessage(msg), []);

  const sendAssets = React.useCallback(() => {
    const r = ref.current;
    if (!r.node) return;
    r.decoded.forEach((channels, id) => {
      if (r.sent.has(id)) return;
      r.sent.add(id);
      r.node.port.postMessage({ type: 'asset', id, channels });
    });
  }, []);

  const start = React.useCallback(async () => {
    const r = ref.current;
    if (r.node) { if (r.ctx.state !== 'running') await r.ctx.resume(); return; }
    if (!r.starting) {
      r.starting = (async () => {
        const ctx = context();
        // Loaded on first play: Vite bundles the engine into one worklet script and returns its URL.
        const { default: workletUrl } = await import('../../../lib/studio/studioWorklet.js?worker&url');
        await ctx.audioWorklet.addModule(workletUrl);
        const node = new AudioWorkletNode(ctx, 'censai-studio', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
        node.connect(ctx.destination);
        node.port.onmessage = (e) => {
          const m = e.data || {};
          if (m.type === 'tick') ticker.set({ beat: m.beat, playing: m.playing, meters: m.meters });
          else if (m.type === 'error') setError(`Audio engine stopped: ${m.message}`);
        };
        r.node = node;
        node.port.postMessage({ type: 'project', project: projectRef.current });
        sendAssets();
      })();
    }
    await r.starting;
    if (r.ctx.state !== 'running') await r.ctx.resume();
  }, [context, sendAssets, ticker]);

  // Every project change (local or from a teammate) goes to the audio thread.
  React.useEffect(() => { post({ type: 'project', project }); }, [project, post]);

  // Decode any audio this browser has for the project's clips.
  const assetKey = Object.keys(project.assets).sort().join('|');
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = ref.current;
      const gone = [];
      for (const id of Object.keys(projectRef.current.assets)) {
        if (r.decoded.has(id)) continue;
        const rec = await loadAsset(id);
        if (!rec?.blob) { gone.push(id); continue; }
        try {
          const buf = await context().decodeAudioData(await rec.blob.arrayBuffer());
          r.decoded.set(id, channelsOf(buf));
        } catch { gone.push(id); }
      }
      if (cancelled) return;
      setMissing(gone);
      sendAssets();
    })();
    return () => { cancelled = true; };
  }, [assetKey, context, sendAssets]);

  /** Stores and decodes a file; returns the asset record for the project. */
  const addAudio = React.useCallback(async (blob, name) => {
    const ctx = context();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const id = newId('asset');
    const channels = channelsOf(buf);
    ref.current.decoded.set(id, channels);
    await saveAsset(id, blob, name);
    sendAssets();
    return { id, asset: { name, dur: buf.duration, peaks: computePeaks(channels) } };
  }, [context, sendAssets]);

  const transport = React.useMemo(() => ({
    play: async (beat) => { await start(); post({ type: 'play', beat }); },
    stop: () => post({ type: 'stop' }),
    seek: (beat) => { ticker.set({ beat }); post({ type: 'seek', beat }); },
  }), [start, post, ticker]);

  React.useEffect(() => () => {
    const r = ref.current;
    try { r.node?.disconnect(); r.ctx?.close(); } catch { /* already closed */ }
  }, []);

  return {
    ticker, transport, addAudio, missing, error, start,
    sampleRate: () => ref.current.ctx?.sampleRate || 48000,
    decoded: () => ref.current.decoded,
    context,
  };
}

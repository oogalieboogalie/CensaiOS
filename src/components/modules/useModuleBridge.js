import React from 'react';
import { readThemeTokens } from '../../lib/modules/moduleDocument.js';
import { askFromModule } from '../../lib/modules/moduleApi.js';
import { clampModuleSize } from '../../lib/modules/moduleFormat.js';
import { getPresence, subscribePresence } from '../../lib/modules/presenceRoster.js';
import { declares, findTool } from '../../lib/modules/manifestV3.js';

// The host half of the Module SDK. Answers only the calls the SDK defines,
// and only from this window's own iframe; pushes theme, storage and presence
// changes down to it. Manifest v3: storage and presence reach the module only
// when its manifest declares them, and agents can press the tools it declares
// (callTool) once the module's code has said it handles them.

export const MAX_MODULE_STORAGE_BYTES = 256 * 1024;
const MAX_KEY_LENGTH = 100;
const ASKS_PER_MINUTE = 20;
export const TOOL_TIMEOUT_MS = 20000;
const READY_TIMEOUT_MS = 8000;

class RefusedError extends Error {
  constructor(permission, message) { super(message); this.permission = permission; }
}

function bytes(value) {
  try { return new TextEncoder().encode(JSON.stringify(value ?? null)).length; } catch { return Infinity; }
}

export function nextModuleData(current, { key, value, remove }) {
  const name = String(key || '').slice(0, MAX_KEY_LENGTH);
  if (!name) throw new Error('Storage keys must be non-empty text.');
  const next = { ...(current || {}) };
  if (remove || value === null || value === undefined) delete next[name];
  else next[name] = value;
  if (bytes(next) > MAX_MODULE_STORAGE_BYTES) throw new Error('This module has used all of its storage (256 KB).');
  return next;
}

const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;

/**
 * Save a file a built-in sealed window hands over (File > Export in the 3D
 * Editor). The host saves it, so it never depends on the sandbox's own
 * download rules or on how long the export took.
 */
export function saveModuleFile({ name, data } = {}) {
  if (!(data instanceof ArrayBuffer) || data.byteLength > MAX_DOWNLOAD_BYTES) throw new Error('That file can\'t be saved (200 MB at most).');
  const safe = Array.from(String(name || 'download')).map(c => (c < ' ' || '\\/:*?"<>|'.includes(c) ? '_' : c)).join('').slice(0, 120) || 'download';
  const url = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = safe;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function useThemeTokens() {
  const [tokens, setTokens] = React.useState(() => readThemeTokens());
  React.useEffect(() => {
    if (typeof MutationObserver === 'undefined') return undefined;
    let frame = 0;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = readThemeTokens();
        setTokens(current => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
      });
    };
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  return tokens;
}

export function useModuleBridge({ frameRef, win, manifest, onUpdate, workspaceId, tokens, grants, requestPermission, onToast, onScriptError, onRefused, frameAllow = [] }) {
  const latest = React.useRef({});
  latest.current = { win, manifest, onUpdate, workspaceId, grants, requestPermission, onToast, onScriptError, onRefused, frameAllow };
  const askTimes = React.useRef([]);
  // Tool calls from agents, and whether the module's code has loaded.
  const toolCalls = React.useRef(new Map());
  const readyState = React.useRef({ ready: false, handled: new Set(), waiters: [] });

  const post = React.useCallback((message) => {
    frameRef.current?.contentWindow?.postMessage({ __hbHost: 1, ...message }, '*');
  }, [frameRef]);

  React.useEffect(() => {
    const answer = (id, result, error) => post({ id, result, error: error ? String(error.message || error) : undefined });
    const onMessage = async (event) => {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const msg = event.data;
      if (!msg || msg.__hbModule !== 1 || typeof msg.method !== 'string') return;
      const { win: w, onUpdate: update, manifest: m } = latest.current;
      const args = msg.args && typeof msg.args === 'object' ? msg.args : {};
      try {
        switch (msg.method) {
          case 'storage.set': {
            if (!declares(m, 'storage')) throw new RefusedError('storage', 'This module did not ask to save data in its manifest.');
            const data = nextModuleData(w.moduleData, args);
            update?.({ moduleData: data });
            return answer(msg.id, true);
          }
          case 'agent.ask': return answer(msg.id, await ask(args));
          case 'toast':
            latest.current.onToast?.(String(args.message || '').slice(0, 160));
            return answer(msg.id, true);
          case 'resize': {
            const size = clampModuleSize({ w: args.w, h: args.h });
            update?.(size);
            return answer(msg.id, size);
          }
          case 'error':
            latest.current.onScriptError?.(String(args.message || 'Script error').slice(0, 300));
            return undefined;
          case 'download':
            if (!latest.current.frameAllow?.includes('downloads')) throw new RefusedError('downloads', 'This window may not save files.');
            saveModuleFile(args);
            return answer(msg.id, true);
          case 'refused':
            latest.current.onRefused?.({ permission: String(args.permission || 'network'), target: String(args.target || '').slice(0, 200) });
            return undefined;
          case 'ready':
          case 'tools.handled': {
            const state = readyState.current;
            if (msg.method === 'ready') state.ready = true;
            for (const name of [...(Array.isArray(args.tools) ? args.tools : []), args.name].filter(Boolean)) state.handled.add(String(name));
            if (state.ready) { state.waiters.splice(0).forEach(fn => fn()); }
            return undefined;
          }
          case 'tool.result': {
            const pending = toolCalls.current.get(String(args.callId || ''));
            if (!pending) return undefined;
            toolCalls.current.delete(String(args.callId));
            if (args.ok) pending.resolve(args.result ?? null); else pending.reject(new Error(String(args.error || 'The tool failed.').slice(0, 300)));
            return undefined;
          }
          default:
            return answer(msg.id, null, new Error(`censai.${msg.method} is not part of the Module SDK.`));
        }
      } catch (error) {
        if (error instanceof RefusedError) latest.current.onRefused?.({ permission: error.permission, target: '' });
        return answer(msg.id, null, error);
      }
    };

    async function ask({ prompt }) {
      const { win: w, grants: g, requestPermission: request, workspaceId: ws } = latest.current;
      if (!declares(latest.current.manifest, 'agent')) throw new RefusedError('agent', 'This module did not ask for agent access in its manifest.');
      let allowed = g.agent;
      if (allowed === undefined) allowed = await request('agent');
      if (!allowed) throw new RefusedError('agent', 'Agent access was declined for this module.');
      const now = Date.now();
      askTimes.current = askTimes.current.filter(t => now - t < 60000);
      if (askTimes.current.length >= ASKS_PER_MINUTE) throw new Error('Too many agent questions this minute. Try again shortly.');
      askTimes.current.push(now);
      return askFromModule({ prompt: String(prompt || '').slice(0, 4000), moduleName: w.manifest?.name, workspaceId: ws });
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [frameRef, post]);

  // Live pushes: theme preset changes, shared storage edits, who's here.
  const canStore = declares(manifest, 'storage');
  const canSeePeople = declares(manifest, 'presence');
  React.useEffect(() => { post({ type: 'theme', tokens }); }, [post, tokens]);
  React.useEffect(() => { post({ type: 'storage', data: canStore ? (win.moduleData || {}) : {} }); }, [post, win.moduleData, canStore]);
  React.useEffect(() => (canSeePeople ? subscribePresence(people => post({ type: 'presence', people })) : undefined), [post, canSeePeople]);

  // A new document (code or network grant changed) starts unready again.
  const resetReady = React.useCallback(() => {
    readyState.current = { ready: false, handled: new Set(), waiters: readyState.current.waiters };
  }, []);

  // Fail calls still waiting when the window closes.
  React.useEffect(() => () => {
    for (const pending of toolCalls.current.values()) pending.reject(new Error('The module window closed.'));
    toolCalls.current.clear();
  }, []);

  /** Press one of the module's declared tools, as an agent would. */
  const callTool = React.useCallback(async (name, input = {}) => {
    const tool = findTool(latest.current.manifest, name);
    if (!tool) throw new Error(`This module has no "${name}" tool in its manifest.`);
    const state = readyState.current;
    if (!state.ready) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('The module did not finish loading.')), READY_TIMEOUT_MS);
        state.waiters.push(() => { clearTimeout(timer); resolve(); });
      });
    }
    const callId = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        toolCalls.current.delete(callId);
        reject(new Error('The module did not answer in time.'));
      }, TOOL_TIMEOUT_MS);
      toolCalls.current.set(callId, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      post({ type: 'tool', callId, name: tool.name, input });
    });
  }, [post]);

  return { initialPresence: getPresence, callTool, resetReady };
}

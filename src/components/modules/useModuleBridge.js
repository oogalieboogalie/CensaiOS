import React from 'react';
import { readThemeTokens } from '../../lib/modules/moduleDocument.js';
import { askFromModule } from '../../lib/modules/moduleApi.js';
import { clampModuleSize } from '../../lib/modules/moduleFormat.js';
import { getPresence, subscribePresence } from '../../lib/modules/presenceRoster.js';

// The host half of the Module SDK. Answers only the calls the SDK defines,
// and only from this window's own iframe; pushes theme, storage and presence
// changes down to it.

export const MAX_MODULE_STORAGE_BYTES = 256 * 1024;
const MAX_KEY_LENGTH = 100;
const ASKS_PER_MINUTE = 20;

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

export function useModuleBridge({ frameRef, win, onUpdate, workspaceId, tokens, grants, requestPermission, onToast, onScriptError }) {
  const latest = React.useRef({});
  latest.current = { win, onUpdate, workspaceId, grants, requestPermission, onToast, onScriptError };
  const askTimes = React.useRef([]);

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
      const { win: w, onUpdate: update } = latest.current;
      const args = msg.args && typeof msg.args === 'object' ? msg.args : {};
      try {
        switch (msg.method) {
          case 'storage.set': {
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
          default:
            return answer(msg.id, null, new Error(`censai.${msg.method} is not part of the Module SDK.`));
        }
      } catch (error) {
        return answer(msg.id, null, error);
      }
    };

    async function ask({ prompt }) {
      const { win: w, grants: g, requestPermission: request, workspaceId: ws } = latest.current;
      if (!w.manifest?.permissions?.includes('agent')) throw new Error('This module did not ask for agent access in its manifest.');
      let allowed = g.agent;
      if (allowed === undefined) allowed = await request('agent');
      if (!allowed) throw new Error('Agent access was declined for this module.');
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
  React.useEffect(() => { post({ type: 'theme', tokens }); }, [post, tokens]);
  React.useEffect(() => { post({ type: 'storage', data: win.moduleData || {} }); }, [post, win.moduleData]);
  React.useEffect(() => subscribePresence(people => post({ type: 'presence', people })), [post]);

  return { initialPresence: getPresence };
}

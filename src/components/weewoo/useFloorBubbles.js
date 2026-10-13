import React from 'react';

const SHOW_MS = 4600;
const FRESH_MS = 15000;

// Speech bubbles on the floor. A bubble pops when something new happens:
// one agent asks another for help, a helper answers, an agent picks up a
// task, calls a tool or replies. Bubbles expire on their own after 4.6s
// (the WeeWoo rule: the client times them out, nothing tells it to).
export function useFloorBubbles(office, now) {
  const seen = React.useRef(null);
  const [bubbles, setBubbles] = React.useState([]);

  React.useEffect(() => {
    const events = [];
    for (const t of office.threads) {
      const at = Date.parse(t.updatedAt || t.createdAt || '') || 0;
      if (t.status === 'completed' && t.result && t.to) events.push({ key: `${t.id}:done`, at, from: t.to, to: t.from, text: t.result, kind: 'reply', thread: t.id });
      else if (t.from && t.to) events.push({ key: `${t.id}:ask`, at: Date.parse(t.createdAt || '') || at, from: t.from, to: t.to, text: t.task, kind: 'ask', thread: t.id });
    }
    for (const a of office.agents) {
      const last = a.log[a.log.length - 1];
      if (!last) continue;
      const text = last.kind === 'tool' ? `→ ${last.text}` : last.kind === 'start' ? `picking up: ${last.text}` : last.text;
      if (text) events.push({ key: `${a.windowId}:${last.at}:${last.kind}`, at: last.at, from: a.windowId, to: null, text, kind: last.kind === 'error' ? 'error' : 'say' });
    }
    const first = seen.current === null;
    if (first) seen.current = new Set();
    const fresh = events.filter((e) => !seen.current.has(e.key) && (!first || now - e.at < FRESH_MS) && now - e.at < FRESH_MS * 4);
    for (const e of events) seen.current.add(e.key);
    if (!fresh.length) return;
    setBubbles((current) => [...current, ...fresh.map((e) => ({ ...e, id: e.key, until: Date.now() + SHOW_MS }))].slice(-8));
  }, [office, now]);

  React.useEffect(() => {
    if (!bubbles.length) return undefined;
    const next = Math.min(...bubbles.map((b) => b.until)) - Date.now();
    const timer = setTimeout(() => setBubbles((current) => current.filter((b) => b.until > Date.now())), Math.max(50, next));
    return () => clearTimeout(timer);
  }, [bubbles]);

  return bubbles;
}

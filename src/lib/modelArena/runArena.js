// Sends one arena run and hands each NDJSON event to `onEvent` as it
// arrives. Resolves when the server says every lane has finished.
export async function runArena({ prompt, system, models, maxTokens, signal, onEvent }) {
  const res = await fetch('/api/model-arena/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: JSON.stringify({ prompt, system, models, maxTokens }),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `The arena could not start (${res.status}).`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const handle = (line) => {
    if (!line.trim()) return;
    try { onEvent(JSON.parse(line)); } catch { /* half a line or a keep-alive */ }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    lines.forEach(handle);
  }
  handle(buffer);
}

/** Folds one event into the per-lane results array. Pure; exported for tests. */
export function applyArenaEvent(results, event) {
  if (!event || !Number.isInteger(event.lane) || !results[event.lane]) return results;
  const next = results.slice();
  const lane = { ...next[event.lane] };
  if (event.type === 'start') Object.assign(lane, { status: 'waiting', model: event.model });
  else if (event.type === 'delta') Object.assign(lane, { status: 'streaming', text: lane.text + String(event.text || '') });
  else if (event.type === 'done') {
    Object.assign(lane, { status: 'done', firstTokenMs: event.firstTokenMs, totalMs: event.totalMs, usage: event.usage, finishReason: event.finishReason });
  } else if (event.type === 'error') {
    Object.assign(lane, { status: 'error', totalMs: event.totalMs, error: event.error || { message: 'This model did not answer.' } });
  } else return results;
  next[event.lane] = lane;
  return next;
}

export function emptyResult() {
  return { status: 'waiting', text: '', firstTokenMs: null, totalMs: null, usage: null, error: null };
}
